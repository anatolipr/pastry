import { LitElement, html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  isNewActionPickerOpen, editActionTarget, newActionKind,
  deleteActionTarget, isDeleteActionDialogOpen, recordActionUsed, duplicateAction,
} from '../store/actions-store';
import { hasPlaceholders, applyPlaceholders, openPlaceholderFill } from '../store/clipboard-store';
import { isUrlScratchpadOpen, pasteUrlScratch } from '../store/url-scratchpad-store';
import type { ActionEntry } from '../shared-types';
import './action-item';
import './new-action-dialog';
import './terminal-action-dialog';
import './url-action-dialog';
import './form-action-dialog';
import './text-action-dialog';
import './app-action-dialog';
import './url-list-dialog';
import './delete-action-dialog';
import './placeholder-dialog';

@customElement('actions-app')
export class ActionsApp extends LitElement {
  private watcher = new SignalWatcher(this);

  @query('#actions-search-input') private _searchInput!: HTMLInputElement;
  @state() private _pasteFeedback: string | null = null;
  private _pasteFeedbackTimer?: ReturnType<typeof setTimeout>;

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
    .quick-toolbar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
    .quick-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;
      color: var(--text-primary); border: 1px solid var(--border-input-strong); background: var(--bg-input);
      font-family: inherit;
    }
    .quick-btn:hover { background: var(--bg-hover); border-color: var(--accent-pinned); }
    .quick-btn .kbd {
      font-size: 10px; font-weight: 400; color: var(--text-muted);
      border: 1px solid var(--border-input-strong); border-radius: 4px; padding: 1px 5px;
    }
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
      case 'app':
        return '';
    }
  }

  private async _onPasteUrlScratch(): Promise<void> {
    const added = await pasteUrlScratch();
    this._pasteFeedback = added ? '✓ Added' : 'Clipboard empty';
    clearTimeout(this._pasteFeedbackTimer);
    this._pasteFeedbackTimer = setTimeout(() => { this._pasteFeedback = null; }, 1400);
  }

  private _runAction(entry: ActionEntry): void {
    if (hasPlaceholders(this._placeholderScanText(entry))) {
      openPlaceholderFill(this._placeholderScanText(entry), (values) => {
        this._dispatchRun(this._applyPlaceholdersToEntry(entry, values));
      }, entry.paramOptions);
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
      case 'app':
        return entry;
    }
  }

  private _dispatchRun(entry: ActionEntry): void {
    recordActionUsed(entry.id);
    if (entry.kind === 'terminal') {
      if (!entry.command?.trim()) return;
      window.pastryAPI.runTerminalAction({ command: entry.command, workingDirectory: entry.workingDirectory ?? '' });
    } else if (entry.kind === 'url') {
      if (!entry.url?.trim()) return;
      window.pastryAPI.runUrlAction({ url: entry.url });
    } else if (entry.kind === 'form') {
      if (!(entry.steps ?? []).length) return;
      window.pastryAPI.runFormAction({ url: entry.url ?? '', steps: entry.steps ?? [] });
    } else if (entry.kind === 'app') {
      if (!entry.appPath?.trim()) return;
      window.pastryAPI.runAppAction({ appPath: entry.appPath });
    } else {
      if (!entry.text?.trim()) return;
      window.pastryAPI.runTextAction({ text: entry.text, copyToClipboard: entry.copyToClipboard });
    }
    window.pastryAPI.hideActionsWindow();
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (isNewActionPickerOpen.get() || newActionKind.get() || editActionTarget.get() || isDeleteActionDialogOpen.get() || isUrlScratchpadOpen.get()) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const len = filteredActions.get().length;
      activeActionIndex.set(Math.min(activeActionIndex.get() + 1, len - 1));
      this._scrollActiveIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const len = filteredActions.get().length;
      activeActionIndex.set(Math.max(activeActionIndex.get() - 1, len > 0 ? 0 : -1));
      this._scrollActiveIntoView();
    } else if (e.key === 'Enter') {
      const entry = activeAction.get();
      if (entry) { e.preventDefault(); this._runAction(entry); }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      // Don't hijack Cmd/Ctrl+Backspace's native "delete line/word" behavior while typing a search.
      const searchFocused = this.shadowRoot?.activeElement === this._searchInput;
      if (searchFocused) return;
      const entry = activeAction.get();
      if (entry) { e.preventDefault(); deleteActionTarget.set(entry); }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      // Don't hijack Cmd/Ctrl+D while typing a search (browsers/Chromium treat it as
      // bookmark-this-page; here there's no such conflict, but keep it consistent
      // with the Backspace guard above and avoid interfering with text selection).
      const searchFocused = this.shadowRoot?.activeElement === this._searchInput;
      if (searchFocused) return;
      const entry = activeAction.get();
      if (entry) { e.preventDefault(); duplicateAction(entry.id); }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      // Don't hijack Cmd/Ctrl+A's native "select all" while typing a search.
      const searchFocused = this.shadowRoot?.activeElement === this._searchInput;
      if (searchFocused) return;
      e.preventDefault();
      this._onPasteUrlScratch();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
      const searchFocused = this.shadowRoot?.activeElement === this._searchInput;
      if (searchFocused) return;
      e.preventDefault();
      isUrlScratchpadOpen.set(true);
    } else if (e.key === 'Escape') {
      window.pastryAPI.hideActionsWindow();
    }
  };

  private _scrollActiveIntoView(): void {
    requestAnimationFrame(() => {
      // The active row lives inside an <action-item>'s shadow root; walk the composed tree.
      const findActive = (root: ShadowRoot | Document): Element | null => {
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if ((el as HTMLElement).dataset?.['active'] === 'true') return el;
          if (el.shadowRoot) {
            const found = findActive(el.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      const active = this.shadowRoot ? findActive(this.shadowRoot) : null;
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

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
      <div class="quick-toolbar">
        <button class="quick-btn" title="Paste clipboard as a scratch URL" @click=${() => this._onPasteUrlScratch()}>
          <span>${this._pasteFeedback ?? '📋 Add URL'}</span><span class="kbd">⌘A</span>
        </button>
        <button class="quick-btn" title="Open the URL scratchpad" @click=${() => isUrlScratchpadOpen.set(true)}>
          <span>🗒️ Open URLs</span><span class="kbd">⌘U</span>
        </button>
      </div>
      <div class="hint">↑↓ navigate · Enter run · ⌘A add URL · ⌘U open URLs · ⌘D duplicate · Esc close</div>
      <div class="list">
        <div class="new-row" @click=${() => isNewActionPickerOpen.set(true)}>+ New Action</div>
        ${list.map((entry, i) => html`
          <action-item
            .entry=${entry}
            .active=${i === activeIdx}
            @click=${() => this._runAction(entry)}
            @contextmenu=${(e: Event) => { e.preventDefault(); editActionTarget.set(entry); }}
            @edit-action=${() => editActionTarget.set(entry)}
            @delete-action=${() => deleteActionTarget.set(entry)}
            @duplicate-action=${() => duplicateAction(entry.id)}
          ></action-item>
        `)}
      </div>
      <new-action-dialog></new-action-dialog>
      <terminal-action-dialog></terminal-action-dialog>
      <url-action-dialog></url-action-dialog>
      <form-action-dialog></form-action-dialog>
      <text-action-dialog></text-action-dialog>
      <app-action-dialog></app-action-dialog>
      <url-list-dialog></url-list-dialog>
      ${isDeleteActionDialogOpen.get() ? html`<delete-action-dialog></delete-action-dialog>` : ''}
      <placeholder-dialog></placeholder-dialog>
    `;
  }
}
