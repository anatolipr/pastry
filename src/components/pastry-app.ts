import { LitElement, html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isPinDialogOpen, isUnpinDialogOpen, isEditDialogOpen, isDeleteDialogOpen,
  searchQuery, activeItem, combinedItems, moveActiveIndexInPanel, moveActivePanel, setActiveIndex,
} from '../store/clipboard-store';
import './history-list';
import './pinned-list';
import './search-results';
import './pin-dialog';
import './unpin-dialog';
import './edit-dialog';
import './delete-dialog';

@customElement('pastry-app')
export class PastryApp extends LitElement {
  private watcher = new SignalWatcher(this);

  @query('#search-input') private _searchInput!: HTMLInputElement;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #1e1e22;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    }
    .titlebar {
      -webkit-app-region: drag;
      height: 28px;
      background: #18181c;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .titlebar-text {
      font-size: 12px;
      font-weight: 600;
      color: #aaa;
      letter-spacing: 0.04em;
    }
    .search-bar {
      padding: 8px 12px 6px;
      flex-shrink: 0;
      background: #1e1e22;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .search-bar input {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 13px;
      padding: 6px 10px;
      outline: none;
    }
    .search-bar input:focus {
      border-color: rgba(105,180,255,0.5);
      background: rgba(255,255,255,0.09);
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
      background: rgba(255, 255, 255, 0.07);
      flex-shrink: 0;
    }
    .hint {
      font-size: 10px;
      color: #777;
      padding: 3px 12px 5px;
      flex-shrink: 0;
      letter-spacing: 0.02em;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('focus', this._onWindowFocus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('focus', this._onWindowFocus);
  }

  private _onWindowFocus = (): void => {
    // Reset selection and focus search every time the panel opens.
    setActiveIndex(-1);
    requestAnimationFrame(() => this._searchInput?.focus());
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    // Don't intercept when a dialog is open or user is editing pinned item text.
    if (isPinDialogOpen.get() || isUnpinDialogOpen.get() || isEditDialogOpen.get() || isDeleteDialogOpen.get()) return;

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
        window.pastryAPI.pasteItem({ text: item.entry.text, imageDataUrl: item.entry.imageDataUrl });
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      const item = activeItem.get();
      if (item) {
        // Only intercept Cmd+C when an item is actively selected.
        e.preventDefault();
        if (item.entry.imageDataUrl) {
          window.pastryAPI.writeImageClipboard(item.entry.imageDataUrl);
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

  render() {
    return html`
      <div class="titlebar">
        <span class="titlebar-text">Pastry</span>
      </div>
      <div class="search-bar">
        <input
          id="search-input"
          type="text"
          placeholder="Search history and pins…"
          autocomplete="off"
          spellcheck="false"
          .value=${searchQuery.get()}
          @input=${this._onSearch}
        />
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
    `;
  }
}
