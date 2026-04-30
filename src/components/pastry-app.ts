import { LitElement, html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isPinDialogOpen, isUnpinDialogOpen, isEditDialogOpen, isDeleteDialogOpen, isSettingsOpen, isNewPinOpen, isReminderDialogOpen,
  isPasteGroupDialogOpen,
  searchQuery, activeItem, combinedItems, moveActiveIndexInPanel, moveActivePanel, setActiveIndex,
  setNewPinOpen, setEditTarget, pinnedItems,
} from '../store/clipboard-store';
import './history-list';
import './pinned-list';
import './search-results';
import './pin-dialog';
import './unpin-dialog';
import './edit-dialog';
import './delete-dialog';
import './settings-dialog';
import './new-pin-dialog';
import './reminder-dialog';
import './paste-group-dialog';

@customElement('pastry-app')
export class PastryApp extends LitElement {
  private watcher = new SignalWatcher(this);

  @query('#search-input') private _searchInput!: HTMLInputElement;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--bg-main);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    }
    .titlebar {
      -webkit-app-region: drag;
      height: 28px;
      background: var(--bg-titlebar);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .titlebar-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.04em;
    }
    .settings-btn {
      -webkit-app-region: no-drag;
      margin-left: auto;
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      transition: color 0.1s, background 0.1s;
    }
    .settings-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
    .search-bar {
      padding: 8px 12px 6px;
      flex-shrink: 0;
      background: var(--bg-main);
      border-bottom: 1px solid var(--border-subtle);
    }
    .search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-bar input {
      width: 100%;
      box-sizing: border-box;
      background: var(--bg-input);
      border: 1px solid var(--border-input);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 13px;
      padding: 6px 10px;
      outline: none;
    }
    .search-bar input:focus {
      border-color: var(--border-focus);
      background: var(--bg-input-focus);
    }
    .search-bar input.has-value {
      padding-right: 28px;
    }
    .clear-btn {
      position: absolute;
      right: 6px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .clear-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
    .panels {
      display: flex;
      flex: 1;
      min-height: 0;
      gap: 0;
    }
    .panels.single {
      flex-direction: column;
    }
    .panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 14px 0 10px;
      min-height: 0;
      overflow: hidden;
    }
    .divider {
      width: 1px;
      background: var(--divider);
      flex-shrink: 0;
    }
    .hint {
      font-size: 10px;
      color: var(--text-hint);
      padding: 3px 12px 5px;
      flex-shrink: 0;
      letter-spacing: 0.02em;
    }
  `;

  private _unsubWindowShown?: () => void;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('focus', this._onWindowFocus);
    this._unsubWindowShown = window.pastryAPI.onWindowShown(this._onWindowShown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('focus', this._onWindowFocus);
    this._unsubWindowShown?.();
  }

  private _onWindowShown = (): void => {
    setActiveIndex(-1);
    // Double rAF ensures the window is painted and focusable before we call focus().
    requestAnimationFrame(() => requestAnimationFrame(() => this._searchInput?.focus()));
  };

  private _onWindowFocus = (): void => {
    // Reset selection and focus search every time the panel opens.
    setActiveIndex(-1);
    requestAnimationFrame(() => this._searchInput?.focus());
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    // Cmd+N: open new pin dialog (works even if another dialog is open, skip if already open)
    if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !isNewPinOpen.get()) {
      e.preventDefault();
      setNewPinOpen(true);
      return;
    }

    // Cmd+E: edit the last added pin
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      const last = pinnedItems.get()[0] ?? null;
      if (last) {
        e.preventDefault();
        setEditTarget(last);
        return;
      }
    }

    // Don't intercept when a dialog is open or user is editing pinned item text.
    if (isPinDialogOpen.get() || isUnpinDialogOpen.get() || isEditDialogOpen.get() || isDeleteDialogOpen.get() || isSettingsOpen.get() || isNewPinOpen.get() || isReminderDialogOpen.get() || isPasteGroupDialogOpen.get()) return;

    // If search is not focused and user types an alphanumeric character (no modifiers),
    // focus the search input and let the keystroke land in it naturally.
    const searchFocused = this.shadowRoot?.activeElement?.id === 'search-input'
      || document.activeElement === this._searchInput;
    if (
      !searchFocused &&
      e.key.length === 1 &&
      /^[a-zA-Z0-9]$/.test(e.key) &&
      !e.metaKey && !e.ctrlKey && !e.altKey
    ) {
      this._searchInput?.focus();
      setActiveIndex(-1);
      // Don't preventDefault — let the character reach the now-focused input.
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActiveIndexInPanel(1);
      this._scrollActiveIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActiveIndexInPanel(-1);
      this._scrollActiveIntoView();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveActivePanel(1);
      this._scrollActiveIntoView();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveActivePanel(-1);
      this._scrollActiveIntoView();
    } else if (e.key === 'Enter') {
      const item = activeItem.get();
      if (item) {
        e.preventDefault();
        window.pastryAPI.pasteItem({ text: item.entry.text, imageDataUrl: item.entry.imageDataUrl, htmlContent: item.entry.htmlContent });
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      const item = activeItem.get();
      if (item) {
        // Only intercept Cmd+C when an item is actively selected.
        e.preventDefault();
        if (item.entry.imageDataUrl) {
          window.pastryAPI.writeImageClipboard(item.entry.imageDataUrl);
        } else if (item.entry.htmlContent) {
          window.pastryAPI.writeRichClipboard({ text: item.entry.text, htmlContent: item.entry.htmlContent });
        } else {
          window.pastryAPI.writeClipboard(item.entry.text);
        }
      }
    } else if (e.key === 'Escape') {
      window.pastryAPI.hideWindow();
    }
  };

  private _scrollActiveIntoView(): void {
    requestAnimationFrame(() => {
      // The active row lives inside a child custom element's shadow root.
      // Walk the composed tree to find it.
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

  private _onSearch(e: Event): void {
    searchQuery.set((e.target as HTMLInputElement).value);
    // Auto-select first result so Enter immediately pastes it.
    setActiveIndex(combinedItems.get().length > 0 ? 0 : -1);
  }

  private _clearSearch(): void {
    searchQuery.set('');
    setActiveIndex(-1);
    this._searchInput?.focus();
  }

  render() {
    return html`
      <div class="titlebar">
        <span class="titlebar-text">Pastry</span>
        <button class="settings-btn" title="Settings" @click=${() => isSettingsOpen.set(true)}>⚙</button>
      </div>
      <div class="search-bar">
        <div class="search-input-wrap">
          <input
            id="search-input"
            type="text"
            placeholder="Search history and pins…"
            autocomplete="off"
            spellcheck="false"
            class=${searchQuery.get() ? 'has-value' : ''}
            .value=${searchQuery.get()}
            @input=${this._onSearch}
          />
          ${searchQuery.get() ? html`<button class="clear-btn" title="Clear search" @click=${this._clearSearch}>✕</button>` : ''}
        </div>
      </div>
      <div class="hint">↑↓ navigate · Enter paste · ⌘C copy · Esc close</div>
      ${searchQuery.get()
        ? html`
          <div class="panels single">
            <div class="panel">
              <search-results></search-results>
            </div>
          </div>`
        : html`
          <div class="panels">
            <div class="panel">
              <history-list></history-list>
            </div>
            <div class="divider"></div>
            <div class="panel">
              <pinned-list></pinned-list>
            </div>
          </div>`
      }
      ${isPinDialogOpen.get() ? html`<pin-dialog></pin-dialog>` : ''}
      ${isUnpinDialogOpen.get() ? html`<unpin-dialog></unpin-dialog>` : ''}
      ${isEditDialogOpen.get() ? html`<edit-dialog></edit-dialog>` : ''}
      ${isDeleteDialogOpen.get() ? html`<delete-dialog></delete-dialog>` : ''}
      ${isNewPinOpen.get() ? html`<new-pin-dialog></new-pin-dialog>` : ''}
      ${isReminderDialogOpen.get() ? html`<reminder-dialog></reminder-dialog>` : ''}
      ${isPasteGroupDialogOpen.get() ? html`<paste-group-dialog></paste-group-dialog>` : ''}
      ${isSettingsOpen.get() ? html`<settings-dialog></settings-dialog>` : ''}
    `;
  }
}
