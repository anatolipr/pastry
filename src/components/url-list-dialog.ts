import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isUrlScratchpadOpen, urlScratchpadItems, addUrlScratchpadItem, removeUrlScratchpadItem, clearUrlScratchpadItems,
} from '../store/url-scratchpad-store';
import type { UrlListItem } from '../shared-types';

@customElement('url-list-dialog')
export class UrlListDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _newUrl = '';
  @state() private _newLabel = '';
  @query('#urllist-url-input') private _urlInput!: HTMLInputElement;
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 0; width: 380px; overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .header {
      display: flex; align-items: center; gap: 8px;
      padding: 14px 20px 12px; background: var(--bg-hover);
      border-bottom: 1px solid var(--border-subtle);
    }
    .header .glyph { font-size: 16px; }
    .header h3 { margin: 0; font-size: 14px; color: var(--accent-pinned); flex: 1; }
    .header .subtitle { font-size: 10px; color: var(--text-hint); text-transform: uppercase; letter-spacing: 0.04em; }
    .body { padding: 16px 20px 20px; }
    .add-row { display: flex; gap: 6px; margin-bottom: 14px; }
    input {
      box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; font-family: inherit;
    }
    input:focus { border-color: var(--accent-pinned); }
    .add-row .url-field { flex: 2; min-width: 0; }
    .add-row .label-field { flex: 1; min-width: 0; }
    .add-btn {
      flex-shrink: 0; border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 0 12px; border: 1px solid var(--border-input-strong);
      background: transparent; color: var(--text-secondary);
    }
    .add-btn:hover:not(:disabled) { background: var(--bg-hover); }
    .add-btn:disabled { opacity: 0.4; cursor: default; }
    .list { max-height: 260px; overflow-y: auto; margin-bottom: 14px; }
    .empty { font-size: 12px; color: var(--text-hint); padding: 10px 2px; }
    .item {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 8px; border-radius: 6px; cursor: pointer;
      border-left: 2px solid var(--accent-pinned);
      margin-bottom: 2px;
    }
    .item:hover { background: var(--bg-hover); }
    .item-text { flex: 1; overflow: hidden; }
    .item-label { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item-url { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .remove-btn {
      flex-shrink: 0; background: transparent; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 12px; padding: 2px 6px; border-radius: 4px;
    }
    .remove-btn:hover { color: var(--accent-danger); background: var(--bg-hover); }
    .actions { display: flex; justify-content: space-between; align-items: center; }
    .count { font-size: 11px; color: var(--text-hint); }
    .right-actions { display: flex; gap: 8px; }
    button.plain {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
      background: transparent; color: var(--text-secondary);
    }
    button.plain:hover:not(:disabled) { background: var(--bg-hover); }
    button.plain:disabled { opacity: 0.4; cursor: default; }
    .confirm { background: var(--accent-pinned); color: #1a1a1e; border-color: var(--accent-pinned); font-weight: 600; }
  `;

  updated() {
    const open = isUrlScratchpadOpen.get();
    if (open && !this._wasOpen) {
      this._urlInput?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    isUrlScratchpadOpen.set(false);
    this._newUrl = '';
    this._newLabel = '';
  }

  private _add(): void {
    const url = this._newUrl.trim();
    if (!url) return;
    addUrlScratchpadItem({ url, label: this._newLabel.trim() || undefined });
    this._newUrl = '';
    this._newLabel = '';
    this._urlInput?.focus();
  }

  private _open(item: UrlListItem): void {
    window.pastryAPI.runUrlAction({ url: item.url });
    window.pastryAPI.hideActionsWindow();
    this._close();
  }

  private _remove(e: Event, itemId: string): void {
    e.stopPropagation();
    removeUrlScratchpadItem(itemId);
  }

  private _onFieldKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.stopPropagation(); this._add(); }
  }

  render() {
    if (!isUrlScratchpadOpen.get()) return html``;
    const items = urlScratchpadItems.get();
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
          <div class="header">
            <span class="glyph">🗒️</span>
            <h3>URL Scratchpad</h3>
            <span class="subtitle">temporary · not an action</span>
          </div>
          <div class="body">
            <div class="add-row">
              <input id="urllist-url-input" class="url-field" .value=${this._newUrl} placeholder="Paste a URL…"
                @input=${(e: Event) => (this._newUrl = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => this._onFieldKeydown(e)} />
              <input class="label-field" .value=${this._newLabel} placeholder="Label (optional)"
                @input=${(e: Event) => (this._newLabel = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => this._onFieldKeydown(e)} />
              <button class="add-btn" ?disabled=${!this._newUrl.trim()} @click=${() => this._add()}>Add</button>
            </div>
            <div class="list">
              ${items.length === 0
                ? html`<div class="empty">No links yet — paste one above.</div>`
                : items.map((item) => html`
                  <div class="item" @click=${() => this._open(item)}>
                    <div class="item-text">
                      <div class="item-label">${item.label || item.url}</div>
                      ${item.label ? html`<div class="item-url">${item.url}</div>` : ''}
                    </div>
                    <button class="remove-btn" title="Remove" @click=${(e: Event) => this._remove(e, item.id)}>✕</button>
                  </div>
                `)}
            </div>
            <div class="actions">
              <span class="count">${items.length} link${items.length === 1 ? '' : 's'}</span>
              <div class="right-actions">
                <button class="plain" ?disabled=${items.length === 0} @click=${() => clearUrlScratchpadItems()}>Clear All</button>
                <button class="plain confirm" @click=${() => this._close()}>Done</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
