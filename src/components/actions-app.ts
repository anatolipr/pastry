import { LitElement, html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredActions, actionsSearchQuery, activeActionIndex, activeAction,
  isNewActionPickerOpen, editActionTarget, newActionKind,
  deleteActionTarget, isDeleteActionDialogOpen,
} from '../store/actions-store';
import type { ActionEntry } from '../shared-types';
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

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (isNewActionPickerOpen.get() || newActionKind.get() || editActionTarget.get() || isDeleteActionDialogOpen.get()) return;

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
      <div class="hint">↑↓ navigate · Enter run · Esc close</div>
      <div class="list">
        <div class="new-row" @click=${() => isNewActionPickerOpen.set(true)}>+ New Action</div>
        ${list.map((entry, i) => html`
          <action-item
            .entry=${entry}
            .active=${i === activeIdx}
            @click=${() => this._runAction(entry)}
            @contextmenu=${(e: Event) => { e.preventDefault(); editActionTarget.set(entry); }}
            @edit-action=${() => editActionTarget.set(entry)}
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
