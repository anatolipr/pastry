# Placeholder Support for Actions + New "Text" Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `::placeholder::` support (reusing Pastry's existing pin-paste placeholder system) to Terminal/URL/Form actions, with autocomplete + cross-action history for filled-in values, and add a new "Text" action kind that types a reusable, placeholder-aware snippet directly into the frontmost app via AppleScript keystrokes — never touching the system clipboard.

**Architecture:** Generalize the existing `placeholder-dialog.ts` (currently pin-paste-only, payload `{text, htmlContent}` → hardcoded `pasteItem`) into a callback-based dialog (`onConfirm(values)`), matching the existing `reminderCallbackTarget` pattern already in `clipboard-store.ts`. Add a new `placeholderHistory: Record<string, string[]>` map to the shared store (global by placeholder name, capped at 10 per name), persisted merge-safely alongside `history`/`pinned`/`actions` in the same `pastry-store.json`. `actions-app.ts`'s `_runAction` gains a placeholder-detection step before running any action kind. The new Text action kind reuses `runPasteGroup`'s target-app-reactivation AppleScript pattern but swaps the clipboard-based paste step for a `keystroke "<literal text>"` sequence (split on newlines, `key code 36` between lines) by default; a per-action `copyToClipboard` checkbox switches it to just writing the resolved text to the clipboard instead (no typing, no target-app reactivation needed).

**Tech Stack:** Same as the existing Actions feature — Lit/avosignals, Electron IPC, AppleScript via `osascript`/`System Events`. No new dependencies.

**No test framework beyond the existing Playwright e2e test** — this plan adds manual verification steps (`npm start` + concrete checks), consistent with prior Actions-feature tasks in this repo.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared-types.ts` (modify) | Add `'text'` to `ActionKind`, add `ActionEntry.text`/`ActionEntry.copyToClipboard` fields |
| `src/window.d.ts` (modify) | Add `placeholderHistory` to `PastryStore`, add `runTextAction`/`loadPlaceholderHistory`/`savePlaceholderHistory` to `PastryAPI` |
| `src/store/clipboard-store.ts` (modify) | Generalize placeholder signal/functions to callback-based; add `placeholderHistory` signal + load/persist; update `persistStore()`'s merge-preservation |
| `src/components/placeholder-dialog.ts` (modify) | Callback-based confirm; per-field fuzzy autocomplete dropdown sourced from `placeholderHistory` |
| `src/components/clipboard-item.ts`, `src/components/pinned-item.ts`, `src/components/pastry-app.ts` (modify) | Update the 3 existing `openPlaceholderPaste(...)` call sites to the new callback API |
| `src/main.ts` (modify) | Merge-preserve `placeholderHistory` in `store:save`; add `placeholder-history:load`/`placeholder-history:save` IPC; add `action:run-text` handler (AppleScript keystroke typing) |
| `src/preload.ts` (modify) | Expose `runTextAction`, `loadPlaceholderHistory`, `savePlaceholderHistory` |
| `src/store/actions-store.ts` (modify) | No signal changes needed — `createAction`/`updateAction` already handle arbitrary `ActionEntry` fields |
| `src/components/text-action-dialog.ts` (create) | Create/edit dialog for the new Text action kind (Name + textarea) |
| `src/components/new-action-dialog.ts` (modify) | Add a 4th kind-picker row: "Text — insert reusable text" |
| `src/components/action-item.ts` (modify) | Add icon for `'text'` kind |
| `src/components/actions-app.ts` (modify) | Import/render `text-action-dialog`; `_runAction` gains placeholder-detection + resolution step before dispatching to any run-* API, plus the `'text'` kind branch |

---

## Task 1: Data model — Text action kind + placeholder history storage

**Files:**
- Modify: `src/shared-types.ts`
- Modify: `src/window.d.ts`

- [ ] **Step 1: Add the `'text'` kind and `text` field to `shared-types.ts`**

Find:
```ts
export type ActionKind = 'terminal' | 'url' | 'form';
```
Replace with:
```ts
export type ActionKind = 'terminal' | 'url' | 'form' | 'text';
```

Find the `ActionEntry` interface's `// 'form' only` comment block and add new fields after it:
```ts
  // 'form' only
  steps?: FormStep[];
  // 'text' only — the reusable template body, may contain ::placeholder:: tokens
  text?: string;
  // 'text' only — when true, copy the resolved text to the clipboard instead of
  // typing it into the frontmost app. Defaults to false (insert/type).
  copyToClipboard?: boolean;
```

> **Already applied directly** (not by a subagent) when the copy-vs-insert requirement came in after Task 1 had already run — `shared-types.ts` already has both fields. Nothing to do here if you're executing this step fresh; just confirm both fields are present.

- [ ] **Step 2: Add `placeholderHistory` to `PastryStore` and 3 new methods to `PastryAPI` in `window.d.ts`**

Add to `PastryStore`:
```ts
  placeholderHistory?: Record<string, string[]>;
```

Add to `PastryAPI` (anywhere after the existing action methods):
```ts
  runTextAction: (payload: { text: string; copyToClipboard?: boolean }) => void;
  loadPlaceholderHistory: () => Promise<Record<string, string[]>>;
  savePlaceholderHistory: (history: Record<string, string[]>) => void;
```

- [ ] **Step 3: Verify**

Run: `npm run lint` and `npx tsc --noEmit` from `/Users/anatoli/workspace2/ai/pastry`. Expected: no new errors (these interfaces aren't consumed yet).

- [ ] **Step 4: Commit** — SKIP. Do not run `git commit`; leave all changes in this plan uncommitted for the user to review and commit themselves, matching the existing session convention for this repo.

---

## Task 2: Generalize the placeholder dialog to a callback-based API + add history

**Files:**
- Modify: `src/store/clipboard-store.ts`
- Modify: `src/components/placeholder-dialog.ts`
- Modify: `src/components/clipboard-item.ts`
- Modify: `src/components/pinned-item.ts`
- Modify: `src/components/pastry-app.ts`
- Modify: `src/main.ts`
- Modify: `src/preload.ts`

This task keeps pin-paste behavior identical from the user's point of view (still opens the same dialog, still pastes on confirm) while making the underlying mechanism reusable by actions in Task 6.

- [ ] **Step 1: Replace the placeholder signal/functions in `clipboard-store.ts`**

Find:
```ts
export interface PlaceholderPastePayload {
  text: string;
  imageDataUrl?: string;
  htmlContent?: string;
}

/** Set when a paste is initiated on text that contains ::placeholder:: tokens. */
export const placeholderPasteTarget = new Signal<PlaceholderPastePayload | null>(null, 'placeholderPasteTarget');
```

Replace with:
```ts
/** A pending request to fill in ::placeholder:: values before some downstream action
 * runs. `text` is used only to extract which placeholder names to show fields for —
 * the caller decides what to actually do with the filled-in values via `onConfirm`. */
export interface PlaceholderFillRequest {
  text: string;
  onConfirm: (values: Record<string, string>) => void;
}

/** Set when something needs placeholder values filled in before it can proceed. */
export const placeholderFillTarget = new Signal<PlaceholderFillRequest | null>(null, 'placeholderFillTarget');
```

Find:
```ts
export const isPlaceholderDialogOpen = new Computed<boolean>(
  () => placeholderPasteTarget.get() !== null,
  'isPlaceholderDialogOpen',
);
```
Replace with:
```ts
export const isPlaceholderDialogOpen = new Computed<boolean>(
  () => placeholderFillTarget.get() !== null,
  'isPlaceholderDialogOpen',
);
```

Find:
```ts
export function openPlaceholderPaste(payload: PlaceholderPastePayload): void {
  placeholderPasteTarget.set(payload);
}

export function closePlaceholderPaste(): void {
  placeholderPasteTarget.set(null);
}
```
Replace with:
```ts
export function openPlaceholderFill(text: string, onConfirm: (values: Record<string, string>) => void): void {
  placeholderFillTarget.set({ text, onConfirm });
}

export function closePlaceholderFill(): void {
  placeholderFillTarget.set(null);
}

const PLACEHOLDER_HISTORY_CAP = 10;

/** Global, cross-feature history of values typed into each named placeholder — shared by
 * pin-paste and every action kind, keyed by placeholder name (not by which pin/action used it). */
export const placeholderHistory = new Signal<Record<string, string[]>>({}, 'placeholderHistory');

/** Records `value` as the most-recent entry for `name`'s history (deduped, capped, persisted). */
export function recordPlaceholderValue(name: string, value: string): void {
  if (!value.trim()) return;
  const current = placeholderHistory.get();
  const existing = current[name] ?? [];
  const next = [value, ...existing.filter((v) => v !== value)].slice(0, PLACEHOLDER_HISTORY_CAP);
  placeholderHistory.set({ ...current, [name]: next });
  window.pastryAPI.savePlaceholderHistory(placeholderHistory.get());
}

export async function loadPersistedPlaceholderHistory(): Promise<void> {
  const loaded = await window.pastryAPI.loadPlaceholderHistory();
  if (loaded) placeholderHistory.set(loaded);
}
```

- [ ] **Step 2: Rewrite `placeholder-dialog.ts` to use the callback API + add autocomplete**

Replace the entire file with:

```ts
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isPlaceholderDialogOpen,
  placeholderFillTarget,
  closePlaceholderFill,
  extractPlaceholders,
  placeholderHistory,
  recordPlaceholderValue,
} from '../store/clipboard-store';

/** Returns true if every character of `query` appears in `text` in order (same
 * fuzzy-match semantics as the actions search — see actions-store.ts). */
function fuzzyMatch(text: string, query: string): boolean {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

@customElement('placeholder-dialog')
export class PlaceholderDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _values: Record<string, string> = {};
  @state() private _openSuggestionsFor: string | null = null;

  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 320px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 4px; font-size: 14px; color: var(--accent-pinned); }
    .subtitle { font-size: 11px; color: var(--text-muted); margin: 0 0 16px; }
    .field { margin-bottom: 14px; position: relative; }
    label {
      display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px;
      font-weight: 600;
    }
    input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; font-family: inherit;
    }
    input:focus { border-color: var(--accent-pinned); }
    .suggestions {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: var(--bg-dialog); border: 1px solid var(--border-input-strong);
      border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      z-index: 200; overflow: hidden; max-height: 160px; overflow-y: auto;
    }
    .suggestion { padding: 6px 12px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
    .suggestion:hover { background: var(--bg-active-pinned); color: var(--text-primary); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    button.cancel {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
      background: transparent; color: var(--text-secondary);
    }
    button.cancel:hover { background: var(--bg-hover); }
    button.confirm {
      border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: 600;
      padding: 6px 14px; border: 1px solid var(--accent-pinned);
      background: var(--accent-pinned); color: #1a1a1e;
    }
    button.confirm:hover { opacity: 0.85; }
  `;

  updated() {
    const isOpen = isPlaceholderDialogOpen.get();
    if (isOpen && !this._wasOpen) {
      this._values = {};
      this._openSuggestionsFor = null;
      requestAnimationFrame(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus();
      });
    }
    this._wasOpen = isOpen;
  }

  private _handleConfirm(): void {
    const request = placeholderFillTarget.get();
    if (!request) return;
    for (const [name, value] of Object.entries(this._values)) {
      recordPlaceholderValue(name, value);
    }
    const values = this._values;
    closePlaceholderFill();
    this._values = {};
    request.onConfirm(values);
  }

  private _handleCancel(): void {
    closePlaceholderFill();
    this._values = {};
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.stopPropagation(); this._handleConfirm(); }
    if (e.key === 'Escape') { e.stopPropagation(); this._handleCancel(); }
  }

  private _suggestionsFor(name: string): string[] {
    const q = (this._values[name] ?? '').trim().toLowerCase();
    const history = placeholderHistory.get()[name] ?? [];
    if (!q) return history;
    return history.filter((v) => fuzzyMatch(v.toLowerCase(), q));
  }

  render() {
    if (!isPlaceholderDialogOpen.get()) return html``;
    const request = placeholderFillTarget.get();
    if (!request) return html``;
    const names = extractPlaceholders(request.text);

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}
        @keydown=${this._onKeyDown}>
        <div class="dialog">
          <h3>Fill in placeholders</h3>
          <p class="subtitle">Enter a value for each placeholder, then confirm.</p>
          ${names.map((name, i) => {
            const suggestions = this._openSuggestionsFor === name ? this._suggestionsFor(name) : [];
            return html`
              <div class="field">
                <label for="ph-${i}">${name}</label>
                <input
                  id="ph-${i}"
                  type="text"
                  autocomplete="off"
                  .value=${this._values[name] ?? ''}
                  placeholder=${name}
                  @focus=${() => { this._openSuggestionsFor = name; }}
                  @input=${(e: Event) => {
                    this._values = { ...this._values, [name]: (e.target as HTMLInputElement).value };
                    this._openSuggestionsFor = name;
                  }}
                  @blur=${() => setTimeout(() => { this._openSuggestionsFor = null; }, 150)}
                  @keydown=${this._onKeyDown}
                />
                ${suggestions.length > 0 ? html`
                  <div class="suggestions">
                    ${suggestions.map((s) => html`
                      <div class="suggestion" @mousedown=${(e: Event) => {
                        e.preventDefault();
                        this._values = { ...this._values, [name]: s };
                        this._openSuggestionsFor = null;
                      }}>${s}</div>`)}
                  </div>` : ''}
              </div>
            `;
          })}
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Confirm</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 3: Update the 3 existing pin-paste call sites**

In `src/components/clipboard-item.ts`, find:
```ts
    if (!this.entry.imageDataUrl && hasPlaceholders(this.entry.text)) {
      openPlaceholderPaste({ text: this.entry.text, htmlContent: this.entry.htmlContent });
```
Replace with (adjust the surrounding braces/close as needed to match the existing block shape):
```ts
    if (!this.entry.imageDataUrl && hasPlaceholders(this.entry.text)) {
      const entry = this.entry;
      openPlaceholderFill(entry.text, (values) => {
        window.pastryAPI.pasteItem({
          text: applyPlaceholders(entry.text, values),
          htmlContent: entry.htmlContent ? applyPlaceholders(entry.htmlContent, values) : undefined,
        });
      });
```
Update the import line at the top of the file: replace `openPlaceholderPaste` with `openPlaceholderFill, applyPlaceholders` (add `applyPlaceholders` to the existing import from `../store/clipboard-store` if not already imported).

Apply the exact same shape of change to `src/components/pinned-item.ts` (same `hasPlaceholders`/`openPlaceholderPaste` call site — mirror the clipboard-item.ts change, using `this.entry` in the same way) and `src/components/pastry-app.ts` (its call site uses `item.entry` instead of `this.entry` — adjust the variable name accordingly, everything else identical).

In all 3 files, remove any now-unused import of `PlaceholderPastePayload` if referenced (it no longer exists).

- [ ] **Step 4: Add merge-safe `placeholderHistory` persistence in `main.ts`**

First, find the existing `store:save` handler (already merge-preserves `actions`) and extend it to also preserve `placeholderHistory`:

Find:
```ts
ipcMain.on('store:save', (_event, data: unknown) => {
  try {
    // Preserve the `actions` key (owned by the actions:save handler) when the
    // clipboard/pins store — which doesn't know about actions — writes the file.
    let existingActions: unknown;
    try {
      existingActions = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8')).actions;
    } catch {
      existingActions = undefined;
    }
    const merged = existingActions !== undefined ? { ...(data as object), actions: existingActions } : data;
    fs.writeFileSync(getStorePath(), JSON.stringify(merged), 'utf-8');
  } catch (err) {
    console.error('[pastry] store:save failed:', err);
  }
});
```
Replace with:
```ts
ipcMain.on('store:save', (_event, data: unknown) => {
  try {
    // Preserve keys this handler doesn't know about (owned by actions:save /
    // placeholder-history:save) when the clipboard/pins store writes the file.
    let existing: { actions?: unknown; placeholderHistory?: unknown } = {};
    try {
      existing = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8'));
    } catch {
      existing = {};
    }
    const merged = {
      ...(data as object),
      ...(existing.actions !== undefined ? { actions: existing.actions } : {}),
      ...(existing.placeholderHistory !== undefined ? { placeholderHistory: existing.placeholderHistory } : {}),
    };
    fs.writeFileSync(getStorePath(), JSON.stringify(merged), 'utf-8');
  } catch (err) {
    console.error('[pastry] store:save failed:', err);
  }
});
```

Then add new handlers directly after the `actions:save` handler:
```ts
ipcMain.handle('placeholder-history:load', () => {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const data = JSON.parse(raw);
    return data?.placeholderHistory && typeof data.placeholderHistory === 'object' ? data.placeholderHistory : {};
  } catch {
    return {};
  }
});

ipcMain.on('placeholder-history:save', (_event, historyData: unknown) => {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8'));
  } catch {
    // No store file yet — start fresh.
  }
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ ...existing, placeholderHistory: historyData }), 'utf-8');
  } catch (err) {
    console.error('[pastry] placeholder-history:save failed:', err);
  }
});
```

Note: `actions:save`'s existing handler already does `{ ...existing, actions: actionsData }`, which already preserves `placeholderHistory` if present — no change needed there.

- [ ] **Step 5: Expose the 2 new IPC methods in `preload.ts`**

Add to the `api` object:
```ts
  loadPlaceholderHistory() {
    return ipcRenderer.invoke('placeholder-history:load');
  },

  savePlaceholderHistory(history) {
    ipcRenderer.send('placeholder-history:save', history);
  },
```

(`runTextAction` is added in Task 3/4 — don't add it here yet.)

- [ ] **Step 6: Hydrate `placeholderHistory` on both windows' boot**

In `src/renderer.ts`, find:
```ts
if (isActionsPanel) {
  // Only the actions panel needs the actions store hydrated — avoids the clipboard
  // window doing an extra, unused actions:load IPC round trip on every show.
  loadPersistedActions();
  applyTheme();
} else {
```
Add a call to hydrate placeholder history in BOTH branches (both windows need it — pins use it in the main window, actions use it in the actions window), by adding `loadPersistedPlaceholderHistory();` as its own line before the `if (isActionsPanel)` check, and importing it: add `loadPersistedPlaceholderHistory` to the existing `import { addToHistory, loadPersistedStore, themeMode } from './store/clipboard-store';` line.

- [ ] **Step 7: Manual verification**

Run: `npm start`. In the clipboard panel, create a pin with text `Hello ::name::`, paste it (Enter or click) — confirm the placeholder dialog still appears exactly as before, typing a value and confirming still pastes correctly. Paste the SAME pin a second time — confirm the previously-typed value now appears as an autocomplete suggestion when you focus the field. Kill `npm start` when done.

Run: `npm run lint` and `npx tsc --noEmit` — confirm no new errors beyond the established baseline (this repo's baseline: 1 pre-existing `forge.config.ts` lint error, ~19 non-null-assertion warnings; no `PastryAPI`/preload type errors).

- [ ] **Step 8: Do not commit.**

---

## Task 3: Main process — Text action execution (insert via keystroke typing, or copy to clipboard)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the `action:run-text` handler**

Directly after the existing `action:run-url` handler in `main.ts`, add:
```ts
// ---------------------------------------------------------------------------
// Action execution — Text (insert via keystroke typing, or copy to clipboard)
// ---------------------------------------------------------------------------

ipcMain.on('action:run-text', (_event, payload: { text: string; copyToClipboard?: boolean }) => {
  if (payload.copyToClipboard) {
    // Plain clipboard write — no target app, no keystrokes, nothing to reactivate.
    lastClipboardText = payload.text;
    lastImageSignature = '';
    clipboard.writeText(payload.text);
    return;
  }
  const targetApp = previousAppForActions;
  const lines: string[] = [];
  if (targetApp) {
    lines.push(`set frontmost of (first application process whose name is "${targetApp}") to true`);
  }
  const textLines = payload.text.split('\n');
  for (let i = 0; i < textLines.length; i++) {
    lines.push(`keystroke ${JSON.stringify(escapeForAppleScriptString(textLines[i]))}`);
    if (i < textLines.length - 1) lines.push(`key code 36`); // Return between lines
  }
  const osaLines = lines.map((l) => `-e 'tell application "System Events" to ${l}'`).join(' ');
  const script = `osascript ${osaLines}`;
  exec(script, (err, stdout, stderr) => {
    if (err) log(`action:run-text failed: ${err.message} | stderr: ${stderr}`);
  });
});
```

Note: `JSON.stringify(escapeForAppleScriptString(textLines[i]))` — `escapeForAppleScriptString` (already defined above `action:run-terminal`) escapes backslashes/quotes for embedding in an AppleScript string literal; `JSON.stringify` then wraps the already-escaped content in a double-quoted string for the `-e` shell argument, matching the exact same double-layer quoting `runPasteGroup` and `action:run-terminal` already use elsewhere in this file. Don't substitute a different quoting approach.

The `lastClipboardText`/`lastImageSignature` writes in the `copyToClipboard` branch mirror the exact bookkeeping the existing `clipboard:write`/`clipboard:paste` handlers already do elsewhere in this file, so the clipboard watcher doesn't immediately re-add this write to clipboard history as if it were externally copied.

- [ ] **Step 2: Manual verification**

Run: `npm start`. Open a text editor (e.g. TextEdit or a Notes window) and click into it so it's frontmost. Then press `⌘⇧Space` to open Actions (this captures `previousAppForActions` as whatever was frontmost — your text editor), open DevTools on the Actions window, and run in the console:
```js
window.pastryAPI.runTextAction({ text: 'line one\nline two' })
```
Expected: "line one", a newline, then "line two" get typed into the text editor. Confirm the system clipboard's contents are unchanged before/after (copy something distinctive first, run the action, then check `pbpaste` in a terminal still shows the original clipboard content, not the typed text).

Then test the copy branch:
```js
window.pastryAPI.runTextAction({ text: 'copied via action', copyToClipboard: true })
```
Expected: nothing gets typed anywhere; running `pbpaste` in a terminal now shows `copied via action`.

Run: `npm run lint` and `npx tsc --noEmit` — confirm no new errors.

- [ ] **Step 3: Do not commit.**

---

## Task 4: Preload + window.d.ts wiring for `runTextAction`

**Files:**
- Modify: `src/preload.ts`

- [ ] **Step 1: Expose `runTextAction`**

Add to the `api` object in `preload.ts` (window.d.ts already declares this from Task 1):
```ts
  runTextAction(payload) {
    ipcRenderer.send('action:run-text', payload);
  },
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit` — confirm the `PastryAPI` interface is now fully satisfied (no missing-member error for `preload.ts`).

- [ ] **Step 3: Do not commit.**

---

## Task 5: New Text action dialog + icon + kind picker entry

**Files:**
- Create: `src/components/text-action-dialog.ts`
- Modify: `src/components/action-item.ts`
- Modify: `src/components/new-action-dialog.ts`
- Modify: `src/components/actions-app.ts`

- [ ] **Step 1: Create `text-action-dialog.ts`**

Mirror `terminal-action-dialog.ts`'s structure exactly (create/edit duality via `newActionKind`/`editActionTarget`, mousedown/mouseup overlay dismiss-safety, Escape/Enter keydown, explicit `_reset()`), but with a single multiline field instead of command/workingDirectory:

```ts
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction } from '../store/actions-store';

@customElement('text-action-dialog')
export class TextActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _text = '';
  @state() private _copyToClipboard = false;
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 380px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
    input {
      width: 100%; box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; margin-bottom: 14px; font-family: inherit;
    }
    textarea {
      width: 100%; box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; margin-bottom: 6px; font-family: inherit;
      resize: vertical; min-height: 100px;
    }
    input:focus, textarea:focus { border-color: var(--accent-pinned); }
    .hint { font-size: 11px; color: var(--text-muted); margin-bottom: 14px; line-height: 1.4; }
    .hint code { background: var(--bg-hover); border-radius: 3px; padding: 0 3px; font-size: 10px; }
    .copy-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .copy-row input[type=checkbox] { width: auto; margin: 0; cursor: pointer; accent-color: var(--accent-pinned); }
    .copy-row label { margin: 0; cursor: pointer; font-size: 12px; color: var(--text-secondary); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .confirm { background: var(--accent-pinned); color: #1a1a1e; border-color: var(--accent-pinned); font-weight: 600; }
    .confirm:disabled { opacity: 0.4; cursor: default; }
  `;

  private _isOpen(): boolean {
    return newActionKind.get() === 'text' || editActionTarget.get()?.kind === 'text';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._text = editing?.text ?? '';
      this._copyToClipboard = editing?.copyToClipboard ?? false;
      this.shadowRoot?.querySelector<HTMLInputElement>('#text-name-input')?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    newActionKind.set(null);
    editActionTarget.set(null);
    this._reset();
  }

  private _reset(): void {
    this._name = '';
    this._text = '';
    this._copyToClipboard = false;
  }

  private _confirm(): void {
    if (!this._name.trim() || !this._text.trim()) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, text: this._text, copyToClipboard: this._copyToClipboard });
    } else {
      createAction({ name: this._name, kind: 'text', text: this._text, copyToClipboard: this._copyToClipboard });
    }
    this._close();
  }

  render() {
    if (!this._isOpen()) return html``;
    return html`
      <div
        class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._close(); delete el.dataset['dismissDown']; }}
      >
        <div
          class="dialog"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._close(); }}
        >
          <h3>${editActionTarget.get() ? 'Edit Text Action' : 'New Text Action'}</h3>
          <label for="text-name-input">Name</label>
          <input id="text-name-input" .value=${this._name} placeholder="Support Access Note"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label for="text-body-input">Text</label>
          <textarea id="text-body-input" .value=${this._text} placeholder="Hi ::clientName::, ..."
            @input=${(e: Event) => (this._text = (e.target as HTMLTextAreaElement).value)}></textarea>
          <p class="hint">Use <code>::name::</code> for a placeholder you'll fill in each time you run this action.</p>
          <div class="copy-row">
            <input id="text-copy-checkbox" type="checkbox" .checked=${this._copyToClipboard}
              @change=${(e: Event) => (this._copyToClipboard = (e.target as HTMLInputElement).checked)} />
            <label for="text-copy-checkbox">Copy to clipboard instead of inserting</label>
          </div>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!this._name.trim() || !this._text.trim()} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

Note: no Enter-to-confirm keydown on the dialog container this time (unlike terminal/url/form dialogs) — the body field is a multiline `<textarea>` where Enter must insert a newline, not submit the form. Only Escape-to-cancel is wired at the dialog level.

- [ ] **Step 2: Add a `'text'` icon to `action-item.ts`**

Find:
```ts
const KIND_ICON: Record<ActionEntry['kind'], string> = {
  terminal: '⚡️',
  url: '🔗',
  form: '🔐',
};
```
Replace with:
```ts
const KIND_ICON: Record<ActionEntry['kind'], string> = {
  terminal: '⚡️',
  url: '🔗',
  form: '🔐',
  text: '📝',
};
```

- [ ] **Step 3: Add a "Text" row to the kind picker in `new-action-dialog.ts`**

Find:
```ts
          <div class="kind-row" tabindex="0" @click=${() => this._pick('form')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('form'); }}>
            <span class="kind-icon">🔐</span><span class="kind-label">Form — open a URL and auto-fill</span>
          </div>
```
Add directly after it:
```ts
          <div class="kind-row" tabindex="0" @click=${() => this._pick('text')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('text'); }}>
            <span class="kind-icon">📝</span><span class="kind-label">Text — type reusable text</span>
          </div>
```

Also update the `_pick` method's parameter type: find `private _pick(kind: 'terminal' | 'url' | 'form'): void` and change to `private _pick(kind: 'terminal' | 'url' | 'form' | 'text'): void`.

- [ ] **Step 4: Import and render `text-action-dialog` in `actions-app.ts`**

Find:
```ts
import './form-action-dialog';
import './delete-action-dialog';
```
Replace with:
```ts
import './form-action-dialog';
import './text-action-dialog';
import './delete-action-dialog';
```

Find:
```ts
      <form-action-dialog></form-action-dialog>
      ${isDeleteActionDialogOpen.get() ? html`<delete-action-dialog></delete-action-dialog>` : ''}
```
Replace with:
```ts
      <form-action-dialog></form-action-dialog>
      <text-action-dialog></text-action-dialog>
      ${isDeleteActionDialogOpen.get() ? html`<delete-action-dialog></delete-action-dialog>` : ''}
```

(The `_runAction` dispatch for `'text'` kind is added in Task 6, alongside placeholder detection — don't add a bare `runTextAction` call here yet, it needs to go through the placeholder-check path.)

- [ ] **Step 5: Manual verification**

Run: `npm start`, press `⌘⇧Space`, click "+ New Action" — confirm a 4th "Text" option appears in the kind picker, and clicking it opens the new dialog with Name + a resizable textarea. Fill in Name="Test Note", Text="hello world", Save — confirm a row appears in the list with the 📝 icon. (Running it isn't wired yet until Task 6 — pressing Enter on it will currently do nothing since `_runAction` doesn't have a `'text'` branch yet; that's expected at this point in the plan.)

Run: `npm run lint` and `npx tsc --noEmit` — confirm no new errors.

- [ ] **Step 6: Do not commit.**

---

## Task 6: Wire placeholder detection + Text execution into `_runAction`

**Files:**
- Modify: `src/components/actions-app.ts`

This is the task that actually makes placeholders work for Terminal/URL/Form, and makes the new Text action runnable.

- [ ] **Step 1: Rewrite `_runAction` in `actions-app.ts`**

Find the entire current `_runAction` method:
```ts
  private _runAction(entry: ActionEntry): void {
    if (entry.kind === 'terminal') {
      if (!entry.command?.trim()) return;
      window.pastryAPI.runTerminalAction({ command: entry.command, workingDirectory: entry.workingDirectory ?? '' });
    } else if (entry.kind === 'url') {
      if (!entry.url?.trim()) return;
      window.pastryAPI.runUrlAction({ url: entry.url });
    } else {
      if (!entry.url?.trim()) return;
      window.pastryAPI.runFormAction({ url: entry.url, steps: entry.steps ?? [] });
    }
    window.pastryAPI.hideActionsWindow();
  }
```

Replace with:
```ts
  /** Concatenates every placeholder-bearing field of an action into one string, purely
   * so extractPlaceholders() can find all the distinct ::name:: tokens across the
   * whole action in one pass. Never sent anywhere — only feeds name extraction. */
  private _placeholderScanText(entry: ActionEntry): string {
    switch (entry.kind) {
      case 'terminal':
        return `${entry.command ?? ''}\n${entry.workingDirectory ?? ''}`;
      case 'url':
        return entry.url ?? '';
      case 'form':
        return `${entry.url ?? ''}\n${(entry.steps ?? []).map((s) => s.value).join('\n')}`;
      case 'text':
        return entry.text ?? '';
    }
  }

  private _runAction(entry: ActionEntry): void {
    if (hasPlaceholders(this._placeholderScanText(entry))) {
      openPlaceholderFill(this._placeholderScanText(entry), (values) => {
        this._dispatchRun(this._applyPlaceholdersToEntry(entry, values));
      });
      return;
    }
    this._dispatchRun(entry);
  }

  private _applyPlaceholdersToEntry(entry: ActionEntry, values: Record<string, string>): ActionEntry {
    switch (entry.kind) {
      case 'terminal':
        return {
          ...entry,
          command: applyPlaceholders(entry.command ?? '', values),
          workingDirectory: applyPlaceholders(entry.workingDirectory ?? '', values),
        };
      case 'url':
        return { ...entry, url: applyPlaceholders(entry.url ?? '', values) };
      case 'form':
        return {
          ...entry,
          url: applyPlaceholders(entry.url ?? '', values),
          steps: (entry.steps ?? []).map((s) => ({ ...s, value: applyPlaceholders(s.value, values) })),
        };
      case 'text':
        return { ...entry, text: applyPlaceholders(entry.text ?? '', values) };
    }
  }

  private _dispatchRun(entry: ActionEntry): void {
    if (entry.kind === 'terminal') {
      if (!entry.command?.trim()) return;
      window.pastryAPI.runTerminalAction({ command: entry.command, workingDirectory: entry.workingDirectory ?? '' });
    } else if (entry.kind === 'url') {
      if (!entry.url?.trim()) return;
      window.pastryAPI.runUrlAction({ url: entry.url });
    } else if (entry.kind === 'form') {
      if (!entry.url?.trim()) return;
      window.pastryAPI.runFormAction({ url: entry.url, steps: entry.steps ?? [] });
    } else {
      if (!entry.text?.trim()) return;
      window.pastryAPI.runTextAction({ text: entry.text, copyToClipboard: entry.copyToClipboard });
    }
    window.pastryAPI.hideActionsWindow();
  }
```

- [ ] **Step 2: Update imports in `actions-app.ts`**

Find:
```ts
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  isNewActionPickerOpen, editActionTarget, newActionKind,
  deleteActionTarget, isDeleteActionDialogOpen,
} from '../store/actions-store';
import type { ActionEntry } from '../shared-types';
```
Replace with:
```ts
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  isNewActionPickerOpen, editActionTarget, newActionKind,
  deleteActionTarget, isDeleteActionDialogOpen,
} from '../store/actions-store';
import { hasPlaceholders, applyPlaceholders, openPlaceholderFill } from '../store/clipboard-store';
import type { ActionEntry } from '../shared-types';
```

- [ ] **Step 3: Confirm the placeholder dialog renders inside the Actions window**

The `<placeholder-dialog>` element is currently only rendered inside `pastry-app.ts` (the clipboard window's template). Since `_runAction` now calls `openPlaceholderFill(...)` from within `actions-app.ts`, the Actions window needs its own `<placeholder-dialog>` element too (each `BrowserWindow` is a separate document — a signal being set doesn't render a component that was never mounted in that window's DOM).

Add the import and render call in `actions-app.ts`:
```ts
import './delete-action-dialog';
```
becomes
```ts
import './delete-action-dialog';
import './placeholder-dialog';
```

And in `render()`, find:
```ts
      ${isDeleteActionDialogOpen.get() ? html`<delete-action-dialog></delete-action-dialog>` : ''}
```
Replace with:
```ts
      ${isDeleteActionDialogOpen.get() ? html`<delete-action-dialog></delete-action-dialog>` : ''}
      <placeholder-dialog></placeholder-dialog>
```

- [ ] **Step 4: Manual verification — full placeholder + Text action flow**

Run: `npm start`, press `⌘⇧Space`.

1. Create a URL action: Name="Grant Support Access", URL=`https://app.impact.com/secure/grantTempSupportAccess.ihtml?clientId=::clientId::&allowLogin=true`. Press Enter on it — confirm the placeholder dialog opens (inside the Actions window this time) asking for `clientId`. Type a value, confirm — the default browser should open with the value substituted into the URL (verify via `open`'s target — you can temporarily check by copying the resolved URL logic: the browser tab's address bar should show the real clientId, not `::clientId::`).
2. Run the SAME action again — confirm the previously-typed clientId now shows as an autocomplete suggestion.
3. Create the Text action from Task 5 with body `Hi ::clientName::, thanks!` — click into a text field somewhere (e.g. Notes app), press `⌘⇧Space`, run the Text action, fill in `clientName`, confirm — verify the resolved text is typed into Notes, and that your system clipboard (check via `pbpaste` in Terminal, having copied something distinctive beforehand) is unchanged.
3b. Edit that same Text action and check "Copy to clipboard instead of inserting", Save. Run it again, fill in `clientName` — confirm nothing gets typed anywhere, and `pbpaste` now shows the resolved text.
4. Create/run a Terminal action with a placeholder in the command (e.g. `echo ::greeting::`) — confirm it resolves and runs correctly in a new Terminal window.
5. Regression: run an existing action with NO placeholders (e.g. a plain Terminal action from earlier testing) — confirm it still runs immediately with no dialog interruption.
6. Regression: `⌘⇧V` clipboard panel — pin-paste with placeholders still works (already covered in Task 2, but do a quick re-check here since this task touched shared code paths).

Kill `npm start` when done.

Run: `npm run lint` and `npx tsc --noEmit` — confirm no new errors beyond the established baseline.

- [ ] **Step 5: Do not commit.**

---

## Task 7: End-to-end verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Full regression pass**

Run `npm start` and verify:
1. All 4 action kinds (Terminal, URL, Form, Text) can be created, edited (right-click or ✏️ button), and deleted (⌘⌫).
2. Placeholders work identically across Terminal (command + workingDirectory), URL, and Form (url + every step) — each shows one combined dialog with all distinct `::name::` fields found across the relevant text.
3. Placeholder value history/autocomplete is shared globally by name — a value typed for `::clientId::` in one action's placeholder fill shows up as a suggestion the next time ANY action (or pin) asks for `::clientId::`.
4. Text action never touches the system clipboard (spot-check with `pbpaste` before/after).
5. Actions/pins with no placeholders run exactly as before (no regression, no extra dialog).
6. Quit and relaunch Pastry — confirm `placeholderHistory` persisted (check `pastry-store.json` in the Electron userData directory has a `placeholderHistory` key) and actions/pins/history are all still intact (confirms the extended `store:save` merge logic didn't drop anything).

- [ ] **Step 2: Do not commit — leave all changes for the user to review.**
