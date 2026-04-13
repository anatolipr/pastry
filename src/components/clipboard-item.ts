import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import type { ClipboardEntry } from '../shared-types';
import { setPinTarget, setDeleteTarget, copyHistoryItemToTop } from '../store/clipboard-store';

@customElement('clipboard-item')
export class ClipboardItem extends LitElement {
  private watcher = new SignalWatcher(this);

  @property({ type: Object }) entry!: ClipboardEntry;
  @property({ type: Boolean }) active = false;

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 6px;
      transition: background 0.12s;
      cursor: pointer;
    }
    .row:hover {
      background: var(--bg-hover);
    }
    .row.active {
      background: var(--bg-active-history);
      outline: 1px solid var(--border-focus);
    }
    .text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      color: var(--text-primary);
      cursor: default;
    }
    .thumbnail {
      flex: 1;
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .thumbnail img {
      max-height: 48px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 3px;
      border: 1px solid var(--border-soft);
      cursor: zoom-in;
    }
    .image-label {
      font-size: 10px;
      color: var(--text-muted);
      margin-left: 6px;
      white-space: nowrap;
    }
    .time {
      font-size: 10px;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    button {
      background: var(--bg-input);
      border: 1px solid var(--border-dialog);
      border-radius: 4px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 11px;
      padding: 3px 7px;
      transition: background 0.1s, color 0.1s;
    }
    button:hover {
      background: var(--bg-hover);
    }
    button.pin {
      color: var(--accent-pinned);
      border-color: var(--accent-pinned);
    }
    button.pin:hover {
      background: var(--bg-active-pinned);
    }
    button.delete {
      color: var(--accent-danger);
      border-color: var(--accent-danger);
    }
    button.delete:hover {
      background: var(--bg-active-history);
    }
    .richtext-badge {
      font-size: 11px;
      flex-shrink: 0;
      cursor: default;
    }
  `;

  private _formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private _handleCopy(): void {
    if (this.entry.imageDataUrl) {
      window.pastryAPI.writeImageClipboard(this.entry.imageDataUrl);
    } else if (this.entry.htmlContent) {
      window.pastryAPI.writeRichClipboard({ text: this.entry.text, htmlContent: this.entry.htmlContent });
    } else {
      window.pastryAPI.writeClipboard(this.entry.text);
    }
    copyHistoryItemToTop(this.entry.id);
    window.dispatchEvent(new CustomEvent('pastry:close'));
  }

  private _handlePaste(): void {
    window.pastryAPI.pasteItem({ text: this.entry.text, imageDataUrl: this.entry.imageDataUrl, htmlContent: this.entry.htmlContent });
  }

  private _handlePin(): void {
    setPinTarget(this.entry);
  }

  private _handleDelete(): void {
    setDeleteTarget(this.entry);
  }

  private _handleImagePreview(e: Event): void {
    e.stopPropagation();
    window.pastryAPI.openImagePreview(this.entry.imageDataUrl!, 'Image');
  }

  render() {
    const isImage = Boolean(this.entry.imageDataUrl);
    const content = isImage
      ? html`<div class="thumbnail"><img src=${this.entry.imageDataUrl!} @click=${this._handleImagePreview} /><span class="image-label">Image</span></div>`
      : html`<span class="text" title=${this.entry.text}>${this.entry.text}</span>`;
    return html`
      <div class="row ${this.active ? 'active' : ''}" @click=${this._handlePaste}>
        ${content}
        ${this.entry.htmlContent ? html`<span class="richtext-badge" title="Rich text / HTML">📝</span>` : ''}
        <span class="time">${this._formatTime(this.entry.timestamp)}</span>
        <div class="actions" @click=${(e: Event) => e.stopPropagation()}>
          <button @click=${this._handleCopy}>Copy</button>
          <button @click=${this._handlePaste}>Paste</button>
          <button class="pin" @click=${this._handlePin}>Pin</button>
          <button class="delete" @click=${this._handleDelete}>Delete</button>
        </div>
      </div>
    `;
  }
}
