# Pastry Actions Launcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Actions" feature to Pastry — a second global-shortcut-triggered window where the user defines named Terminal / URL / Form actions and fuzzy-searches + runs them with Enter, reusing Pastry's existing paste-group AppleScript mechanism for form autofill.

**Architecture:** A new `ActionEntry` data type persisted alongside pins/history in the existing `pastry-store.json`. A second `BrowserWindow` loads the *same* renderer bundle (`index.html`) with a `?panel=actions` query param; `renderer.ts` reads that param at boot and mounts either `<pastry-app>` (existing) or the new `<actions-app>` element. A new global shortcut (`⌘⇧Space`) toggles the actions window, parallel to the existing `⌘⇧V` clipboard shortcut. Three new IPC handlers in `main.ts` execute the three action kinds: `action:run-terminal` (osascript → Terminal.app `do script`), `action:run-url` (`open <url>`), `action:run-form` (`open <url>` + an always-on-top "waiting" popup window + Done/Esc → reactivate the browser and run a paste-group AppleScript built from structured steps).

**Tech Stack:** Electron 41 (main/preload/renderer), Lit 3 (web components), avosignals (reactive state), TypeScript, macOS `osascript`/AppleScript for all cross-app automation (same techniques already used for paste and reminders — no new dependencies).

**No test framework exists in this repo** (no jest/vitest configured) — verification steps below are manual (`npm start` + concrete UI actions), matching the codebase's existing practice.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared-types.ts` (modify) | Add `ActionKind`, `FormStep`, `ActionEntry` types |
| `src/constants.ts` (modify) | Add `ACTIONS_SHORTCUT` |
| `src/window.d.ts` (modify) | Add new `PastryAPI` methods + extend `PastryStore` with `actions` |
| `src/store/actions-store.ts` (create) | Signals + CRUD + fuzzy search for actions (mirrors `clipboard-store.ts` patterns) |
| `src/store/clipboard-store.ts` (modify) | Export `fuzzyMatch` so `actions-store.ts` can reuse it |
| `src/preload.ts` (modify) | Expose action IPC methods |
| `src/renderer.ts` (modify) | Branch bootstrap on `?panel=actions` |
| `src/components/actions-app.ts` (create) | Top-level shell for the Actions window (search bar, list, hint bar, dialogs) |
| `src/components/action-item.ts` (create) | Single row renderer for an action |
| `src/components/new-action-dialog.ts` (create) | Kind picker (Terminal / URL / Form) shown when creating a new action |
| `src/components/terminal-action-dialog.ts` (create) | Create/edit a Terminal action (name, command, working directory) |
| `src/components/url-action-dialog.ts` (create) | Create/edit a URL action (name, url) |
| `src/components/form-action-dialog.ts` (create) | Create/edit a Form action (name, url, repeatable steps list) |
| `src/components/delete-action-dialog.ts` (create) | Confirm delete, mirrors `delete-dialog.ts` |
| `src/main.ts` (modify) | Actions window creation/toggle, global shortcut registration, 3 new IPC handlers, waiting-popup window, reusable paste-group AppleScript runner |

---

## Task 1: Data model, constants, and store persistence types

**Files:**
- Modify: `src/shared-types.ts`
- Modify: `src/constants.ts`
- Modify: `src/window.d.ts`

- [ ] **Step 1: Add the action types to `shared-types.ts`**

Append to the end of the file:

```ts
export type ActionKind = 'terminal' | 'url' | 'form';

export interface FormStep {
  value: string;
  then: 'tab' | 'enter' | 'none';
}

export interface ActionEntry {
  id: string;
  name: string;
  kind: ActionKind;
  createdAt: number;
  // 'terminal'
  command?: string;
  workingDirectory?: string;
  // 'url' and 'form'
  url?: string;
  // 'form' only
  steps?: FormStep[];
}
```

- [ ] **Step 2: Add the actions shortcut constant**

In `src/constants.ts`, add below the existing `GLOBAL_SHORTCUT` line:

```ts
export const ACTIONS_SHORTCUT = 'CommandOrControl+Shift+Space';
```

- [ ] **Step 3: Extend `PastryAPI` and `PastryStore` in `window.d.ts`**

Add these members inside the `PastryAPI` interface (anywhere after `onHistoryFullData`):

```ts
  loadActions: () => Promise<import('./shared-types').ActionEntry[]>;
  saveActions: (actions: import('./shared-types').ActionEntry[]) => void;
  runTerminalAction: (payload: { command: string; workingDirectory: string }) => void;
  runUrlAction: (payload: { url: string }) => void;
  runFormAction: (payload: { url: string; steps: import('./shared-types').FormStep[] }) => void;
  hideActionsWindow: () => void;
  onActionsWindowShown: (callback: () => void) => () => void;
```

Add `actions?: import('./shared-types').ActionEntry[];` inside `PastryStore`:

```ts
export interface PastryStore {
  history: import('./shared-types').ClipboardEntry[];
  pinned: import('./shared-types').PinnedEntry[];
  historySize: number;
  maxImageSizeMb?: number;
  shortcut?: string;
  sequentialPasteShortcut?: string;
  themeMode?: string;
  actions?: import('./shared-types').ActionEntry[];
}
```

- [ ] **Step 4: Manually verify types compile**

Run: `npm run lint`
Expected: no new type errors (the new interfaces aren't used anywhere yet, so this should pass cleanly).

- [ ] **Step 5: Commit**

```bash
git add src/shared-types.ts src/constants.ts src/window.d.ts
git commit -m "feat(actions): add ActionEntry data model and constants"
```

---

## Task 2: Actions store (signals, CRUD, fuzzy search)

**Files:**
- Modify: `src/store/clipboard-store.ts` (export `fuzzyMatch`)
- Create: `src/store/actions-store.ts`

- [ ] **Step 1: Export `fuzzyMatch` from `clipboard-store.ts`**

Find this in `src/store/clipboard-store.ts`:

```ts
/** Returns true if every character of `query` appears in `text` in order. */
function fuzzyMatch(text: string, query: string): boolean {
```

Change `function fuzzyMatch` to `export function fuzzyMatch` (keep the body and doc comment unchanged).

- [ ] **Step 2: Create `src/store/actions-store.ts`**

```ts
import { Signal, Computed } from 'avosignals';
import type { ActionEntry } from '../shared-types';
import { fuzzyMatch } from './clipboard-store';

export const actions = new Signal<ActionEntry[]>([], 'actions');
export const actionsSearchQuery = new Signal<string>('', 'actionsSearchQuery');
export const activeActionIndex = new Signal<number>(-1, 'activeActionIndex');

/** Kind chosen in the "+ New Action" picker; null means the picker itself is closed. */
export const newActionKind = new Signal<'terminal' | 'url' | 'form' | null>(null, 'newActionKind');

/** The action currently being edited (drives the matching kind-specific dialog). */
export const editActionTarget = new Signal<ActionEntry | null>(null, 'editActionTarget');

/** The action currently being considered for deletion (drives delete-action-dialog). */
export const deleteActionTarget = new Signal<ActionEntry | null>(null, 'deleteActionTarget');

export const isDeleteActionDialogOpen = new Computed<boolean>(
  () => deleteActionTarget.get() !== null,
  'isDeleteActionDialogOpen',
);

export const filteredActions = new Computed<ActionEntry[]>(() => {
  const q = actionsSearchQuery.get().toLowerCase().trim();
  const all = actions.get();
  if (!q) return all;
  return all.filter((a) => fuzzyMatch(a.name.toLowerCase(), q));
}, 'filteredActions');

export const activeAction = new Computed<ActionEntry | null>(() => {
  const list = filteredActions.get();
  const idx = activeActionIndex.get();
  return idx >= 0 && idx < list.length ? list[idx] : null;
}, 'activeAction');

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.pastryAPI.saveActions(actions.get());
  }, 150);
}

export async function loadPersistedActions(): Promise<void> {
  const loaded = await window.pastryAPI.loadActions();
  if (loaded) actions.set(loaded);
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createAction(entry: Omit<ActionEntry, 'id' | 'createdAt'>): void {
  const full: ActionEntry = { ...entry, id: newId(), createdAt: Date.now() };
  actions.set([full, ...actions.get()]);
  persist();
}

export function updateAction(id: string, updates: Partial<ActionEntry>): void {
  actions.set(actions.get().map((a) => (a.id === id ? { ...a, ...updates } : a)));
  persist();
}

export function deleteAction(id: string): void {
  actions.set(actions.get().filter((a) => a.id !== id));
  persist();
}
```

- [ ] **Step 3: Manually verify**

Run: `npm run lint`
Expected: passes (no consumers yet, so `actions-store.ts` exports are unused but valid).

- [ ] **Step 4: Commit**

```bash
git add src/store/actions-store.ts src/store/clipboard-store.ts
git commit -m "feat(actions): add actions store with fuzzy search and CRUD"
```

---

## Task 3: Main process — actions window, global shortcut, persistence IPC

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Import the new constant and add actions window state**

Near the top of `src/main.ts`, change:

```ts
import { GLOBAL_SHORTCUT, POLL_INTERVAL_MS } from './constants';
```

to:

```ts
import { GLOBAL_SHORTCUT, ACTIONS_SHORTCUT, POLL_INTERVAL_MS } from './constants';
```

Below `let mainWindow: BrowserWindow | null = null;`, add:

```ts
let actionsWindow: BrowserWindow | null = null;
let previousAppForActions = '';
```

- [ ] **Step 2: Add `createActionsWindow()` next to `createWindow()`**

Directly after the existing `createWindow` function body (after its closing `};`), add:

```ts
const createActionsWindow = () => {
  actionsWindow = new BrowserWindow({
    width: 640,
    height: 420,
    minWidth: 480,
    minHeight: 300,
    frame: false,
    alwaysOnTop: true,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    actionsWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?panel=actions`);
  } else {
    actionsWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { search: 'panel=actions' },
    );
  }

  actionsWindow.on('blur', () => {
    actionsWindow?.hide();
  });
};
```

- [ ] **Step 3: Add `toggleActionsWindow()` next to `toggleWindow()`**

Directly after the existing `toggleWindow` function, add:

```ts
function toggleActionsWindow(): void {
  if (!actionsWindow) return;
  if (actionsWindow.isVisible()) {
    actionsWindow.hide();
  } else {
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      (err, stdout, stderr) => {
        if (err) {
          log(`capture frontmost (actions) failed: ${err.message} | stderr: ${stderr}`);
        } else {
          previousAppForActions = stdout.trim();
        }
        actionsWindow?.show();
        actionsWindow?.focus();
        actionsWindow?.webContents.send('actions-window:shown');
      },
    );
  }
}
```

- [ ] **Step 4: Create and register the actions window on app ready**

In the `app.on('ready', ...)` handler, find:

```ts
  createWindow();
  startClipboardWatcher();
  globalShortcut.register(currentShortcut, toggleWindow);
```

Replace with:

```ts
  createWindow();
  createActionsWindow();
  startClipboardWatcher();
  globalShortcut.register(currentShortcut, toggleWindow);
  globalShortcut.register(ACTIONS_SHORTCUT, toggleActionsWindow);
```

- [ ] **Step 5: Hide the actions window on `window:hide` too**

Find:

```ts
ipcMain.on('window:hide', () => {
  mainWindow?.hide();
});
```

Add a sibling handler right after it:

```ts
ipcMain.on('actions-window:hide', () => {
  actionsWindow?.hide();
});
```

- [ ] **Step 6: Add actions persistence IPC handlers, reusing the existing `pastry-store.json`**

Per the settled design, actions live in the *same* store file as clipboard history/pins (new `actions` key), so they're automatically included in the existing export/import and both windows read/write the one file. `store:load`/`store:save` already round-trip arbitrary JSON (`data: unknown`) — the actions store's `persist()` (Task 2) writes only its own `actions` key, so it needs to merge with whatever else is already in the file rather than overwrite it. Add two thin handlers that do that merge on the main-process side:

Directly after the existing `ipcMain.on('store:save', ...)` handler, add:

```ts
ipcMain.handle('actions:load', () => {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data?.actions) ? data.actions : [];
  } catch {
    return [];
  }
});

ipcMain.on('actions:save', (_event, actionsData: unknown) => {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8'));
  } catch {
    // No store file yet — start fresh.
  }
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ ...existing, actions: actionsData }), 'utf-8');
  } catch (err) {
    console.error('[pastry] actions:save failed:', err);
  }
});
```

Note: `store:save` (used by the clipboard/pins UI) also does a blind overwrite rather than a merge — this same read-modify-write pattern is what keeps the two save paths (clipboard/pins vs actions) from clobbering each other's keys when both windows are open. `pins:export`/`pins:import` already serialize/deserialize the whole store object, so `actions` is included in those flows automatically with no further changes needed there.

- [ ] **Step 7: Manual verification**

Run: `npm start`
Expected: app launches with no errors in the terminal; pressing `⌘⇧V` still opens the clipboard panel as before (unaffected). The actions window doesn't have a visible trigger yet — that's wired up in Task 7's preload work plus Task 2's store already existing; for now just confirm the app boots without exceptions (check the terminal running `npm start` for stack traces).

- [ ] **Step 8: Commit**

```bash
git add src/main.ts
git commit -m "feat(actions): add actions window, shortcut, and persistence IPC"
```

---

## Task 4: Main process — Terminal and URL action execution

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the `action:run-terminal` handler**

Directly after the `actions:save` handler added in Task 3, add:

```ts
// ---------------------------------------------------------------------------
// Action execution — Terminal
// ---------------------------------------------------------------------------

function escapeForAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

ipcMain.on('action:run-terminal', (_event, payload: { command: string; workingDirectory: string }) => {
  const dir = payload.workingDirectory.trim();
  const cmd = payload.command.trim();
  const shellLine = dir ? `cd ${JSON.stringify(dir)} && ${cmd}` : cmd;
  const script = `tell application "Terminal"
    activate
    do script ${JSON.stringify(shellLine)}
  end tell`;
  exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout, stderr) => {
    if (err) log(`action:run-terminal failed: ${err.message} | stderr: ${stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Action execution — URL
// ---------------------------------------------------------------------------

ipcMain.on('action:run-url', (_event, payload: { url: string }) => {
  exec(`open ${JSON.stringify(payload.url)}`, (err, stdout, stderr) => {
    if (err) log(`action:run-url failed: ${err.message} | stderr: ${stderr}`);
  });
});
```

> Using `tell application "Terminal" ... do script` opens a brand-new Terminal window/tab and runs the command visibly, matching the settled design (always a new window, no reuse tracking). `JSON.stringify` is used to safely quote both the shell command string (handles embedded quotes/backslashes) and the URL passed to `open`.

- [ ] **Step 2: Manual verification — Terminal action**

Run: `npm start`, then in the running app's DevTools console (View → Toggle Developer Tools, since there's no UI trigger yet) run:

```js
window.pastryAPI.runTerminalAction({ command: 'echo hello-from-pastry', workingDirectory: '/tmp' })
```

Expected: a new Terminal.app window opens, `cd /tmp && echo hello-from-pastry` runs, and prints `hello-from-pastry`.

- [ ] **Step 3: Manual verification — URL action**

In the same DevTools console:

```js
window.pastryAPI.runUrlAction({ url: 'https://example.com' })
```

Expected: your default browser opens a new tab to `https://example.com`.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(actions): execute Terminal and URL actions"
```

---

## Task 5: Main process — Form action execution (URL + waiting popup + paste-group)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Extract a reusable paste-group AppleScript runner**

This step refactors the existing inline AppleScript-building logic in the `clipboard:paste` handler's `isGroupPaste` branch into a standalone function so the new Form action can reuse it without duplicating the escaping/timing logic.

Find this block inside `ipcMain.on('clipboard:paste', ...)`:

```ts
    // Build AppleScript lines
    const lines: string[] = [];
    if (target) {
      lines.push(`set frontmost of (first application process whose name is "${target}") to true`);
    }
    for (let i = 0; i < segments.length; i++) {
      // Escape backslashes then double-quotes for AppleScript string literals
      const escaped = segments[i].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      lines.push(`set the clipboard to "${escaped}"`);
      lines.push(`keystroke "v" using command down`);
      if (i < separators.length) {
        lines.push(`delay 0.08`);
        const sep = separators[i];
        if (sep === '[ENTER]') {
          lines.push(`key code 36`); // Return key
        } else {
          lines.push(`key code 48`); // Tab key
        }
        lines.push(`delay 0.08`);
      }
    }

    const osaLines = lines.map((l) => `-e 'tell application "System Events" to ${l}'`).join(' ');
    const script = `osascript ${osaLines}`;
    log(`paste-groups triggered (${segments.length} segments), previousApp=${JSON.stringify(target)}`);
    log(`running script: ${script}`);
    exec(script, (err, stdout, stderr) => {
      if (err) log(`paste-groups failed: ${err.message} | stderr: ${stderr}`);
      else log(`paste-groups succeeded stdout=${stdout.trim()}`);
    });
    return;
```

Replace it with a call to a new shared helper:

```ts
    runPasteGroup(segments, separators, target);
    return;
```

Then add the extracted helper function above the `clipboard:paste` handler (near the other module-level helper functions like `log`):

```ts
/** Runs a paste-group sequence: activates `targetApp` (if given), then for each
 * segment sets the clipboard and sends Cmd+V, followed by the separator key
 * (Tab/Enter) from `separators[i]` when present (one fewer separator than segments). */
function runPasteGroup(segments: string[], separators: string[], targetApp: string): void {
  const lines: string[] = [];
  if (targetApp) {
    lines.push(`set frontmost of (first application process whose name is "${targetApp}") to true`);
  }
  for (let i = 0; i < segments.length; i++) {
    const escaped = escapeForAppleScriptString(segments[i]);
    lines.push(`set the clipboard to "${escaped}"`);
    lines.push(`keystroke "v" using command down`);
    if (i < separators.length) {
      lines.push(`delay 0.08`);
      const sep = separators[i];
      lines.push(sep === '[ENTER]' ? `key code 36` : `key code 48`); // Return : Tab
      lines.push(`delay 0.08`);
    }
  }
  const osaLines = lines.map((l) => `-e 'tell application "System Events" to ${l}'`).join(' ');
  const script = `osascript ${osaLines}`;
  log(`paste-groups triggered (${segments.length} segments), targetApp=${JSON.stringify(targetApp)}`);
  exec(script, (err, stdout, stderr) => {
    if (err) log(`paste-groups failed: ${err.message} | stderr: ${stderr}`);
    else log(`paste-groups succeeded stdout=${stdout.trim()}`);
  });
}
```

> `escapeForAppleScriptString` here is the same helper added in Task 4 Step 1 — it must appear once in the file (defined before both call sites). Since Task 4 already added it, just reuse it; don't redefine it.

- [ ] **Step 2: Add the waiting-popup HTML window (mirrors the existing reminder popup)**

Add this near the other inline-HTML popups (after the `IMAGE_PREVIEW_HTML`/`HISTORY_FULL_HTML` section):

```ts
// ---------------------------------------------------------------------------
// Form action — "waiting for page to load" popup
// ---------------------------------------------------------------------------

const FORM_WAITING_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100vh;
    background: #1e1e1e; display: flex; flex-direction: column;
    overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #titlebar {
    -webkit-app-region: drag;
    height: 28px; background: #2a2a2a; display: flex; align-items: center;
    padding: 0 14px; flex-shrink: 0; font-size: 12px; font-weight: 600;
    color: #aaa; border-bottom: 1px solid #3a3a3a; box-sizing: border-box; gap: 6px;
  }
  #body {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 16px 20px; gap: 14px; text-align: center;
  }
  #message { font-size: 13px; color: #e8e8e8; line-height: 1.5; max-width: 300px; }
  #done {
    -webkit-app-region: no-drag;
    background: #4c8ef7; border: none; border-radius: 6px; color: #fff;
    cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 24px;
  }
  #done:hover { background: #6aa0ff; }
  #hint { font-size: 11px; color: #777; }
</style>
</head><body>
<div id="titlebar"><span>⏳</span><span>Pastry — Form Action</span></div>
<div id="body">
  <div id="message">Waiting for the page to load. Click into the field to fill, then click Done.</div>
  <button id="done">Done</button>
  <div id="hint">Esc to cancel</div>
</div>
<script>
  document.getElementById('done').addEventListener('click', function() {
    window.pastryAPI.completeFormAction();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') window.pastryAPI.cancelFormAction();
  });
</script>
</body></html>`;

let formWaitingWindow: BrowserWindow | null = null;
let pendingFormSteps: { value: string; then: 'tab' | 'enter' | 'none' }[] = [];
let pendingFormTargetApp = '';

ipcMain.on('action:run-form', (_event, payload: { url: string; steps: { value: string; then: 'tab' | 'enter' | 'none' }[] }) => {
  pendingFormSteps = payload.steps;
  exec(`open ${JSON.stringify(payload.url)}`, (err) => {
    if (err) log(`action:run-form open failed: ${err.message}`);
  });

  // Give the browser a moment to become frontmost, then capture it as the paste target.
  setTimeout(() => {
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      (err, stdout) => {
        pendingFormTargetApp = err ? '' : stdout.trim();
        openFormWaitingWindow();
      },
    );
  }, 600);
});

function openFormWaitingWindow(): void {
  formWaitingWindow = new BrowserWindow({
    width: 340,
    height: 180,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  formWaitingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(FORM_WAITING_HTML)}`);
  formWaitingWindow.webContents.once('did-finish-load', () => formWaitingWindow?.show());
}

ipcMain.on('action:form-complete', () => {
  formWaitingWindow?.close();
  formWaitingWindow = null;
  const segments = pendingFormSteps.map((s) => s.value);
  const separators = pendingFormSteps.slice(0, -1).map((s, i) =>
    pendingFormSteps[i].then === 'enter' ? '[ENTER]' : '[TAB]',
  );
  // The last step's own "then" (e.g. Enter to submit) still needs to fire after its paste,
  // so treat it as a trailing separator followed by an empty final segment.
  if (pendingFormSteps.length > 0 && pendingFormSteps[pendingFormSteps.length - 1].then !== 'none') {
    const last = pendingFormSteps[pendingFormSteps.length - 1];
    separators.push(last.then === 'enter' ? '[ENTER]' : '[TAB]');
    segments.push('');
  }
  runPasteGroup(segments, separators, pendingFormTargetApp);
  pendingFormSteps = [];
  pendingFormTargetApp = '';
});

ipcMain.on('action:form-cancel', () => {
  formWaitingWindow?.close();
  formWaitingWindow = null;
  pendingFormSteps = [];
  pendingFormTargetApp = '';
});
```

> The trailing empty-segment trick reuses `runPasteGroup` unchanged: pasting an empty string types nothing, but the separator key (Tab/Enter) after it still fires, so a step whose `then` is `'enter'` on the *last* step still submits the form.

- [ ] **Step 2: Manual verification**

Run: `npm start`, open DevTools console on the main window, and run:

```js
window.pastryAPI.runFormAction({
  url: 'https://the-internet.herokuapp.com/login',
  steps: [
    { value: 'tomsmith', then: 'tab' },
    { value: 'SuperSecretPassword!', then: 'enter' },
  ],
})
```

Expected: default browser opens the login page; ~600ms later a small "waiting" popup appears. Click into the username field on the page, then click **Done** in the popup — the popup closes, and the username/password get pasted with Tab between them and Enter submitting the form. Pressing Esc instead of Done should close the popup with no paste happening.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(actions): execute Form actions via URL open + waiting popup + paste-group"
```

---

## Task 6: Preload + renderer bootstrap wiring

**Files:**
- Modify: `src/preload.ts`
- Modify: `src/renderer.ts`

- [ ] **Step 1: Expose the new APIs in `preload.ts`**

Add these entries to the `api` object (anywhere after `onHistoryFullData`):

```ts
  loadActions() {
    return ipcRenderer.invoke('actions:load');
  },

  saveActions(actionsData) {
    ipcRenderer.send('actions:save', actionsData);
  },

  runTerminalAction(payload) {
    ipcRenderer.send('action:run-terminal', payload);
  },

  runUrlAction(payload) {
    ipcRenderer.send('action:run-url', payload);
  },

  runFormAction(payload) {
    ipcRenderer.send('action:run-form', payload);
  },

  completeFormAction() {
    ipcRenderer.send('action:form-complete');
  },

  cancelFormAction() {
    ipcRenderer.send('action:form-cancel');
  },

  hideActionsWindow() {
    ipcRenderer.send('actions-window:hide');
  },

  onActionsWindowShown(callback) {
    const handler = () => callback();
    ipcRenderer.on('actions-window:shown', handler);
    return () => ipcRenderer.removeListener('actions-window:shown', handler);
  },
```

Also add `completeFormAction: () => void;` and `cancelFormAction: () => void;` to the `PastryAPI` interface in `src/window.d.ts` (Task 1 missed these two — add them next to the other action methods there now).

- [ ] **Step 2: Branch the renderer bootstrap on the `panel` query param**

Replace the contents of `src/renderer.ts`:

```ts
import { addToHistory, loadPersistedStore, themeMode } from './store/clipboard-store';
import { loadPersistedActions } from './store/actions-store';

const isActionsPanel = new URLSearchParams(window.location.search).get('panel') === 'actions';

if (isActionsPanel) {
  import('./components/actions-app');
} else {
  import('./components/pastry-app');
}

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------

function applyTheme(): void {
  const mode = themeMode.get();
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

themeMode.subscribe(applyTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

loadPersistedActions();

if (!isActionsPanel) {
  loadPersistedStore().then(() => applyTheme());
  window.pastryAPI.onClipboardChange((payload) => {
    addToHistory(payload);
  });
} else {
  applyTheme();
}
```

Also add `<actions-app></actions-app>` handling: since both panels mount into the same `index.html`, find the root mount point in `index.html` (the element `pastry-app` is presumably placed directly in the body) and generalize it — check `index.html`'s `<body>` for the current mount tag before editing.

- [ ] **Step 3: Update `index.html` body to support both custom elements**

Read `index.html`'s `<body>` section; if it currently contains a hardcoded `<pastry-app></pastry-app>`, replace it with a generic mount point that both entry paths can populate, e.g.:

```html
<body>
  <div id="app-root"></div>
</body>
```

Then in `renderer.ts`, after the dynamic import resolves, mount the element into `#app-root`:

```ts
const mountTag = isActionsPanel ? 'actions-app' : 'pastry-app';
const mount = (isActionsPanel ? import('./components/actions-app') : import('./components/pastry-app'))
  .then(() => {
    const el = document.createElement(mountTag);
    document.getElementById('app-root')!.appendChild(el);
  });
```

Replace the earlier plain `import(...)` lines from Step 2 with this `mount` block instead (don't have both).

- [ ] **Step 4: Manual verification**

Run: `npm start`. Confirm `⌘⇧V` still opens the clipboard panel exactly as before (regression check on the `index.html`/`renderer.ts` change). The actions panel has no visible content yet (Task 7 builds `actions-app`) — confirm no console errors when `createActionsWindow()` loads `?panel=actions` (check via `⌘⇧Space`, which should show a blank/empty frameless window without crashing).

- [ ] **Step 5: Commit**

```bash
git add src/preload.ts src/renderer.ts src/window.d.ts index.html
git commit -m "feat(actions): wire preload API and dual-panel renderer bootstrap"
```

---

## Task 7: Actions window UI shell + list + fuzzy search

**Files:**
- Create: `src/components/actions-app.ts`
- Create: `src/components/action-item.ts`

- [ ] **Step 1: Create `action-item.ts`**

```ts
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ActionEntry } from '../shared-types';

const KIND_ICON: Record<ActionEntry['kind'], string> = {
  terminal: '⚡️',
  url: '🔗',
  form: '🔐',
};

@customElement('action-item')
export class ActionItem extends LitElement {
  @property({ attribute: false }) entry!: ActionEntry;
  @property({ type: Boolean }) active = false;

  static styles = css`
    :host { display: block; }
    .row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; cursor: pointer; border-radius: 6px;
      font-size: 13px; color: var(--text-primary);
    }
    .row.active { background: var(--bg-active-history); }
    .row:hover { background: var(--bg-hover); }
    .icon { font-size: 14px; flex-shrink: 0; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kind { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  `;

  render() {
    return html`
      <div class="row ${this.active ? 'active' : ''}" data-active=${this.active}>
        <span class="icon">${KIND_ICON[this.entry.kind]}</span>
        <span class="name">${this.entry.name}</span>
        <span class="kind">${this.entry.kind}</span>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Create `actions-app.ts`**

```ts
import { LitElement, html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  newActionKind, editActionTarget, deleteAction, deleteActionTarget,
  isDeleteActionDialogOpen,
} from '../store/actions-store';
import './action-item';
import './new-action-dialog';
import './terminal-action-dialog';
import './url-action-dialog';
import './form-action-dialog';
import './delete-action-dialog';

@customElement('actions-app')
export class ActionsApp extends LitElement {
  private watcher = new SignalWatcher(this);

  @query('#actions-search-input') private _searchInput!: HTMLInputElement;

  static styles = css`
    :host {
      display: flex; flex-direction: column; height: 100vh;
      background: var(--bg-main); color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    }
    .titlebar {
      -webkit-app-region: drag;
      height: 28px; background: var(--bg-titlebar); flex-shrink: 0;
      display: flex; align-items: center; padding: 0 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .titlebar-text { font-size: 12px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.04em; }
    .search-bar { padding: 8px 12px 6px; flex-shrink: 0; border-bottom: 1px solid var(--border-subtle); }
    .search-bar input {
      width: 100%; box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input); border-radius: 6px; color: var(--text-primary);
      font-size: 13px; padding: 6px 10px; outline: none;
    }
    .search-bar input:focus { border-color: var(--border-focus); background: var(--bg-input-focus); }
    .list { flex: 1; overflow-y: auto; padding: 8px; }
    .new-row {
      display: flex; align-items: center; gap: 8px; padding: 6px 12px;
      cursor: pointer; border-radius: 6px; font-size: 13px; color: var(--accent-pinned);
    }
    .new-row:hover { background: var(--bg-hover); }
    .hint { font-size: 10px; color: var(--text-hint); padding: 3px 12px 5px; flex-shrink: 0; }
  `;

  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
    this._unsub = window.pastryAPI.onActionsWindowShown(this._onShown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
    this._unsub?.();
  }

  private _onShown = (): void => {
    activeActionIndex.set(filteredActions.get().length > 0 ? 0 : -1);
    requestAnimationFrame(() => requestAnimationFrame(() => { this._searchInput?.focus(); this._searchInput?.select(); }));
  };

  private _onSearch(e: Event): void {
    actionsSearchQuery.set((e.target as HTMLInputElement).value);
    activeActionIndex.set(filteredActions.get().length > 0 ? 0 : -1);
  }

  private _runAction(entry: import('../shared-types').ActionEntry): void {
    if (entry.kind === 'terminal') {
      window.pastryAPI.runTerminalAction({ command: entry.command ?? '', workingDirectory: entry.workingDirectory ?? '' });
    } else if (entry.kind === 'url') {
      window.pastryAPI.runUrlAction({ url: entry.url ?? '' });
    } else {
      window.pastryAPI.runFormAction({ url: entry.url ?? '', steps: entry.steps ?? [] });
    }
    window.pastryAPI.hideActionsWindow();
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (newActionKind.get() || editActionTarget.get() || isDeleteActionDialogOpen.get()) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const len = filteredActions.get().length;
      activeActionIndex.set(Math.min(activeActionIndex.get() + 1, len - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeActionIndex.set(Math.max(activeActionIndex.get() - 1, 0));
    } else if (e.key === 'Enter') {
      const entry = activeAction.get();
      if (entry) { e.preventDefault(); this._runAction(entry); }
    } else if (e.key === 'Escape') {
      window.pastryAPI.hideActionsWindow();
    }
  };

  render() {
    const list = filteredActions.get();
    const activeIdx = activeActionIndex.get();
    return html`
      <div class="titlebar"><span class="titlebar-text">Pastry Actions</span></div>
      <div class="search-bar">
        <input
          id="actions-search-input" type="text" placeholder="Search actions…"
          autocomplete="off" spellcheck="false"
          .value=${actionsSearchQuery.get()}
          @input=${this._onSearch}
        />
      </div>
      <div class="hint">↑↓ navigate · Enter run · Esc close</div>
      <div class="list">
        <div class="new-row" @click=${() => (newActionKind.set('terminal'), newActionKind.set(null), (document.querySelector('new-action-dialog') as HTMLElement)?.dispatchEvent(new Event('noop')))}>+ New Action</div>
        ${list.map((entry, i) => html`
          <action-item
            .entry=${entry}
            .active=${i === activeIdx}
            @click=${() => this._runAction(entry)}
            @contextmenu=${(e: Event) => { e.preventDefault(); editActionTarget.set(entry); }}
          ></action-item>
        `)}
      </div>
      <new-action-dialog></new-action-dialog>
      <terminal-action-dialog></terminal-action-dialog>
      <url-action-dialog></url-action-dialog>
      <form-action-dialog></form-action-dialog>
      ${isDeleteActionDialogOpen.get() ? html`<delete-action-dialog></delete-action-dialog>` : ''}
    `;
  }
}
```

> Fix the `+ New Action` click handler in the next task once `new-action-dialog` exposes a proper open function — the placeholder above is replaced in Task 8 Step 1.

- [ ] **Step 3: Manual verification**

Run: `npm start`, press `⌘⇧Space`. Expected: the Actions window appears with a titlebar, empty search box focused, and no rows (no actions created yet) — no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/actions-app.ts src/components/action-item.ts
git commit -m "feat(actions): add Actions window shell, list, and keyboard nav"
```

---

## Task 8: New/edit action dialogs (kind picker + 3 kind-specific dialogs)

**Files:**
- Create: `src/components/new-action-dialog.ts`
- Create: `src/components/terminal-action-dialog.ts`
- Create: `src/components/url-action-dialog.ts`
- Create: `src/components/form-action-dialog.ts`
- Modify: `src/store/actions-store.ts` (add `isNewActionPickerOpen`)
- Modify: `src/components/actions-app.ts` (wire the real open handler)

- [ ] **Step 1: Add a picker-open signal to `actions-store.ts`**

Add near the other signals:

```ts
export const isNewActionPickerOpen = new Signal<boolean>(false, 'isNewActionPickerOpen');
```

- [ ] **Step 2: Create `new-action-dialog.ts` (kind picker)**

```ts
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { isNewActionPickerOpen, newActionKind } from '../store/actions-store';

@customElement('new-action-dialog')
export class NewActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    .kind-row {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: 6px; cursor: pointer; margin-bottom: 6px;
      border: 1px solid var(--border-input-strong);
    }
    .kind-row:hover { background: var(--bg-hover); }
    .kind-icon { font-size: 16px; }
    .kind-label { font-size: 13px; color: var(--text-primary); }
    .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
      background: transparent; color: var(--text-secondary);
    }
    button:hover { background: var(--bg-hover); }
  `;

  private _pick(kind: 'terminal' | 'url' | 'form'): void {
    isNewActionPickerOpen.set(false);
    newActionKind.set(kind);
  }

  render() {
    if (!isNewActionPickerOpen.get()) return html``;
    return html`
      <div class="overlay" @click=${() => isNewActionPickerOpen.set(false)}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>New Action</h3>
          <div class="kind-row" @click=${() => this._pick('terminal')}>
            <span class="kind-icon">⚡️</span><span class="kind-label">Terminal — run a command</span>
          </div>
          <div class="kind-row" @click=${() => this._pick('url')}>
            <span class="kind-icon">🔗</span><span class="kind-label">URL — open a link</span>
          </div>
          <div class="kind-row" @click=${() => this._pick('form')}>
            <span class="kind-icon">🔐</span><span class="kind-label">Form — open a URL and auto-fill</span>
          </div>
          <div class="actions">
            <button @click=${() => isNewActionPickerOpen.set(false)}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 3: Create `terminal-action-dialog.ts`**

```ts
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction } from '../store/actions-store';

@customElement('terminal-action-dialog')
export class TerminalActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _command = '';
  @state() private _workingDirectory = '';
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 360px;
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
    input:focus { border-color: var(--accent-pinned); }
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
    return newActionKind.get() === 'terminal' || editActionTarget.get()?.kind === 'terminal';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._command = editing?.command ?? '';
      this._workingDirectory = editing?.workingDirectory ?? '';
      this.shadowRoot?.querySelector<HTMLInputElement>('#name-input')?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    newActionKind.set(null);
    editActionTarget.set(null);
  }

  private _confirm(): void {
    if (!this._name.trim() || !this._command.trim()) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, command: this._command, workingDirectory: this._workingDirectory });
    } else {
      createAction({ name: this._name, kind: 'terminal', command: this._command, workingDirectory: this._workingDirectory });
    }
    this._close();
  }

  render() {
    if (!this._isOpen()) return html``;
    return html`
      <div class="overlay" @click=${() => this._close()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${editActionTarget.get() ? 'Edit Terminal Action' : 'New Terminal Action'}</h3>
          <label>Name</label>
          <input id="name-input" .value=${this._name} placeholder="Pending Deploy"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label>Command</label>
          <input .value=${this._command} placeholder="./pending-deploy.sh"
            @input=${(e: Event) => (this._command = (e.target as HTMLInputElement).value)} />
          <label>Working Directory</label>
          <input .value=${this._workingDirectory} placeholder="/Users/anatoli/source2/core"
            @input=${(e: Event) => (this._workingDirectory = (e.target as HTMLInputElement).value)} />
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!this._name.trim() || !this._command.trim()} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 4: Create `url-action-dialog.ts`**

```ts
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction } from '../store/actions-store';

@customElement('url-action-dialog')
export class UrlActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _url = '';
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 360px;
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
    input:focus { border-color: var(--accent-pinned); }
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
    return newActionKind.get() === 'url' || editActionTarget.get()?.kind === 'url';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._url = editing?.url ?? '';
      this.shadowRoot?.querySelector<HTMLInputElement>('#name-input')?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    newActionKind.set(null);
    editActionTarget.set(null);
  }

  private _confirm(): void {
    if (!this._name.trim() || !this._url.trim()) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, url: this._url });
    } else {
      createAction({ name: this._name, kind: 'url', url: this._url });
    }
    this._close();
  }

  render() {
    if (!this._isOpen()) return html``;
    return html`
      <div class="overlay" @click=${() => this._close()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${editActionTarget.get() ? 'Edit URL Action' : 'New URL Action'}</h3>
          <label>Name</label>
          <input id="name-input" .value=${this._name} placeholder="Check Deployed Branch"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label>URL</label>
          <input .value=${this._url} placeholder="https://app.impact.com/monitor-stats/ma_manifest.branch"
            @input=${(e: Event) => (this._url = (e.target as HTMLInputElement).value)} />
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!this._name.trim() || !this._url.trim()} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 5: Create `form-action-dialog.ts` (repeatable steps list)**

```ts
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction } from '../store/actions-store';
import type { FormStep } from '../shared-types';

@customElement('form-action-dialog')
export class FormActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _url = '';
  @state() private _steps: FormStep[] = [{ value: '', then: 'tab' }, { value: '', then: 'enter' }];
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
    input, select {
      box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; font-family: inherit;
    }
    input:focus, select:focus { border-color: var(--accent-pinned); }
    .name-input, .url-input { width: 100%; margin-bottom: 14px; }
    .steps-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .step-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
    .step-row input { flex: 1; }
    .step-row select { width: 90px; }
    .remove-step { background: transparent; border: none; color: var(--accent-danger); cursor: pointer; font-size: 13px; }
    .add-step { background: transparent; border: 1px dashed var(--border-input-strong); color: var(--text-secondary); border-radius: 5px; padding: 5px 10px; font-size: 12px; cursor: pointer; margin-bottom: 14px; }
    .add-step:hover { background: var(--bg-hover); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    button.cancel, button.confirm {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .confirm { background: var(--accent-pinned); color: #1a1a1e; border-color: var(--accent-pinned); font-weight: 600; }
    .confirm:disabled { opacity: 0.4; cursor: default; }
  `;

  private _isOpen(): boolean {
    return newActionKind.get() === 'form' || editActionTarget.get()?.kind === 'form';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._url = editing?.url ?? '';
      this._steps = editing?.steps ?? [{ value: '', then: 'tab' }, { value: '', then: 'enter' }];
      this.shadowRoot?.querySelector<HTMLInputElement>('#name-input')?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    newActionKind.set(null);
    editActionTarget.set(null);
  }

  private _setStep(i: number, patch: Partial<FormStep>): void {
    this._steps = this._steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
  }

  private _addStep(): void {
    this._steps = [...this._steps, { value: '', then: 'none' }];
  }

  private _removeStep(i: number): void {
    this._steps = this._steps.filter((_, idx) => idx !== i);
  }

  private _validSteps(): FormStep[] {
    return this._steps.filter((s) => s.value.trim() !== '');
  }

  private _confirm(): void {
    const steps = this._validSteps();
    if (!this._name.trim() || !this._url.trim() || steps.length === 0) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, url: this._url, steps });
    } else {
      createAction({ name: this._name, kind: 'form', url: this._url, steps });
    }
    this._close();
  }

  render() {
    if (!this._isOpen()) return html``;
    const canConfirm = this._name.trim() && this._url.trim() && this._validSteps().length > 0;
    return html`
      <div class="overlay" @click=${() => this._close()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${editActionTarget.get() ? 'Edit Form Action' : 'New Form Action'}</h3>
          <label>Name</label>
          <input id="name-input" class="name-input" .value=${this._name} placeholder="Login — Demo Advertiser"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label>URL</label>
          <input class="url-input" .value=${this._url} placeholder="http://localhost:12680"
            @input=${(e: Event) => (this._url = (e.target as HTMLInputElement).value)} />
          <div class="steps-label"><label>Fields to type, in order</label></div>
          ${this._steps.map((step, i) => html`
            <div class="step-row">
              <input .value=${step.value} placeholder=${i === 0 ? 'demoadvertiser' : 'password'}
                @input=${(e: Event) => this._setStep(i, { value: (e.target as HTMLInputElement).value })} />
              <select @change=${(e: Event) => this._setStep(i, { then: (e.target as HTMLSelectElement).value as FormStep['then'] })}>
                <option value="tab" ?selected=${step.then === 'tab'}>Then Tab</option>
                <option value="enter" ?selected=${step.then === 'enter'}>Then Enter</option>
                <option value="none" ?selected=${step.then === 'none'}>Then nothing</option>
              </select>
              <button class="remove-step" @click=${() => this._removeStep(i)}>✕</button>
            </div>
          `)}
          <button class="add-step" @click=${() => this._addStep()}>+ Add field</button>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!canConfirm} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 6: Wire the real "+ New Action" click in `actions-app.ts`**

In `src/components/actions-app.ts`, replace the placeholder import/click added in Task 7:

Find:

```ts
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  newActionKind, editActionTarget, deleteAction, deleteActionTarget,
  isDeleteActionDialogOpen,
} from '../store/actions-store';
```

Replace with:

```ts
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  newActionKind, editActionTarget, deleteAction, deleteActionTarget,
  isDeleteActionDialogOpen, isNewActionPickerOpen,
} from '../store/actions-store';
```

Find the `.new-row` line in `render()`:

```html
<div class="new-row" @click=${() => (newActionKind.set('terminal'), newActionKind.set(null), (document.querySelector('new-action-dialog') as HTMLElement)?.dispatchEvent(new Event('noop')))}>+ New Action</div>
```

Replace with:

```html
<div class="new-row" @click=${() => isNewActionPickerOpen.set(true)}>+ New Action</div>
```

- [ ] **Step 7: Manual verification — full create/run flow**

Run: `npm start`, press `⌘⇧Space`, click **+ New Action**, pick **Terminal**, fill in Name=`Say Hi`, Command=`echo hi`, Working Directory=`/tmp`, Save. Confirm the row appears in the list, search for `say` filters to it (fuzzy match), and pressing Enter opens a new Terminal window running `echo hi` in `/tmp`.

Repeat for a **URL** action (any URL) and a **Form** action (e.g. `https://the-internet.herokuapp.com/login` with steps `tomsmith`→Tab, `SuperSecretPassword!`→Enter) to confirm both work end-to-end, including the waiting popup + Done flow from Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/components/new-action-dialog.ts src/components/terminal-action-dialog.ts src/components/url-action-dialog.ts src/components/form-action-dialog.ts src/store/actions-store.ts src/components/actions-app.ts
git commit -m "feat(actions): add kind picker and Terminal/URL/Form authoring dialogs"
```

---

## Task 9: Delete action dialog + right-click menu wiring

**Files:**
- Create: `src/components/delete-action-dialog.ts`
- Modify: `src/components/actions-app.ts`

- [ ] **Step 1: Create `delete-action-dialog.ts`** (mirrors `delete-dialog.ts`'s confirm pattern)

```ts
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { deleteActionTarget, deleteAction } from '../store/actions-store';

@customElement('delete-action-dialog')
export class DeleteActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 10px; font-size: 14px; color: var(--accent-danger); }
    p { font-size: 12px; color: var(--text-secondary); margin: 0 0 16px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button { border-radius: 5px; cursor: pointer; font-size: 12px; padding: 6px 14px; border: 1px solid var(--border-input-strong); }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .confirm { background: var(--accent-danger); color: #fff; border-color: var(--accent-danger); font-weight: 600; }
  `;

  private _close(): void { deleteActionTarget.set(null); }

  private _confirm(): void {
    const target = deleteActionTarget.get();
    if (target) deleteAction(target.id);
    this._close();
  }

  render() {
    const target = deleteActionTarget.get();
    if (!target) return html``;
    return html`
      <div class="overlay" @click=${() => this._close()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Delete Action</h3>
          <p>Delete "${target.name}"? This can't be undone.</p>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" @click=${() => this._confirm()}>Delete</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Wire a delete affordance in `actions-app.ts`**

In `src/components/actions-app.ts`, find the `action-item` rendering in `render()`:

```html
<action-item
  .entry=${entry}
  .active=${i === activeIdx}
  @click=${() => this._runAction(entry)}
  @contextmenu=${(e: Event) => { e.preventDefault(); editActionTarget.set(entry); }}
></action-item>
```

Change the `@contextmenu` handler so right-click opens edit, and add a keyboard delete shortcut (`⌘⌫` on the active row) inside `_onKeyDown`. Find:

```ts
    } else if (e.key === 'Escape') {
      window.pastryAPI.hideActionsWindow();
    }
  };
```

Replace with:

```ts
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      const entry = activeAction.get();
      if (entry) { e.preventDefault(); deleteActionTarget.set(entry); }
    } else if (e.key === 'Escape') {
      window.pastryAPI.hideActionsWindow();
    }
  };
```

- [ ] **Step 3: Manual verification**

Run: `npm start`, press `⌘⇧Space`, right-click an existing action → confirm its edit dialog opens pre-filled. Select an action, press `⌘⌫` → confirm the delete confirmation dialog appears, and confirming removes it from the list.

- [ ] **Step 4: Commit**

```bash
git add src/components/delete-action-dialog.ts src/components/actions-app.ts
git commit -m "feat(actions): add delete confirmation and edit/delete shortcuts"
```

---

## Task 10: End-to-end verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Full regression pass**

Run: `npm start` and manually verify all of the following:
1. `⌘⇧V` still opens the clipboard/pins panel with existing behavior unaffected (paste, pin, edit, settings all still work).
2. `⌘⇧Space` opens the separate Actions window; it does not interfere with the clipboard panel's visibility state.
3. Create one action of each kind (Terminal, URL, Form) and confirm each runs correctly per the manual checks in Tasks 4/5/7.
4. Fuzzy search: typing a subsequence of an action's name (e.g. `pdd` for "Pending Deploy") filters the list correctly.
5. Quit and relaunch Pastry (`npm start` again) — confirm all created actions persisted (stored under the `actions` key in `pastry-store.json` in the Electron userData directory, alongside `history`/`pinned`) and still appear in the Actions window.
6. Esc closes the Actions window from the list view, from the new-action kind picker, from each kind dialog, and from the delete confirmation, without side effects.

- [ ] **Step 2: Commit any final fixups found during verification, then tag the milestone**

```bash
git add -A
git commit -m "chore(actions): fixups from end-to-end verification" --allow-empty
```
