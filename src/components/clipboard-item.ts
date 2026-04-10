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
      background: rgba(255, 255, 255, 0.06);
    }
    .row.active {
      background: rgba(105, 180, 255, 0.15);
      outline: 1px solid rgba(105, 180, 255, 0.35);
    }
    .text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      color: #e0e0e0;
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
      border: 1px solid rgba(255,255,255,0.08);
      cursor: default;
    }
    .image-label {
      font-size: 10px;
      color: #999;
      margin-left: 6px;
      white-space: nowrap;
    }
    .time {
      font-size: 10px;
      color: #999;
      flex-shrink: 0;
    }
    .actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    button {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 4px;
      color: #ccc;
      cursor: pointer;
      font-size: 11px;
      padding: 3px 7px;
      transition: background 0.1s, color 0.1s;
    }
    button:hover {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
    }
    button.pin {
      color: #f0a840;
      border-color: rgba(240, 168, 64, 0.3);
    }
    button.pin:hover {
      background: rgba(240, 168, 64, 0.15);
    }
    button.delete {
      color: #e05a5a;
      border-color: rgba(224, 90, 90, 0.3);
    }
    button.delete:hover {
      background: rgba(224, 90, 90, 0.15);
    }
  `;

  private _formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private _handleCopy(): void {
    if (this.entry.imageDataUrl) {
      window.pastryAPI.writeImageClipboard(this.entry.imageDataUrl);
    } else {
      window.pastryAPI.writeClipboard(this.entry.text);
    }
    copyHistoryItemToTop(this.entry.id);
    window.dispatchEvent(new CustomEvent('pastry:close'));
  }

  private _handlePaste(): void {
    window.pastryAPI.pasteItem({ text: this.entry.text, imageDataUrl: this.entry.imageDataUrl });
  }

  private _handlePin(): void {
    setPinTarget(this.entry);
  }

  private _handleDelete(): void {
    setDeleteTarget(this.entry);
  }

  render() {
    const isImage = Boolean(this.entry.imageDataUrl);
    const content = isImage
      ? html`<div class="thumbnail"><img src=${this.entry.imageDataUrl!} /><span class="image-label">Image</span></div>`
      : html`<span class="text" title=${this.entry.text}>${this.entry.text}</span>`;
    return html`
      <div class="row ${this.active ? 'active' : ''}" @click=${this._handlePaste}>
        ${content}
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
