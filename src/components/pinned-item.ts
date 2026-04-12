import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import type { PinnedEntry } from '../shared-types';
import { setUnpinTarget, setEditTarget, addToHistory } from '../store/clipboard-store';

@customElement('pinned-item')
export class PinnedItem extends LitElement {
  private watcher = new SignalWatcher(this);

  @property({ type: Object }) entry!: PinnedEntry;
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
      background: rgba(240, 168, 64, 0.15);
      outline: 1px solid rgba(240, 168, 64, 0.35);
    }
    .info {
      flex: 1;
      overflow: hidden;
    }
    .name {
      font-size: 12px;
      font-weight: 600;
      color: #f0a840;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .text {
      font-size: 11px;
      color: #bbb;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .thumbnail {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .thumbnail img {
      max-height: 40px;
      max-width: 100%;
      object-fit: contain;
      border-radius: 3px;
      border: 1px solid rgba(255,255,255,0.08);
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
    button.edit {
      color: #69b4ff;
      border-color: rgba(105, 180, 255, 0.3);
    }
    button.edit:hover {
      background: rgba(105, 180, 255, 0.15);
    }
    button.unpin {
      color: #e05a5a;
      border-color: rgba(224, 90, 90, 0.3);
    }
    button.unpin:hover {
      background: rgba(224, 90, 90, 0.15);
    }
  `;

  private _handleCopy(): void {
    if (this.entry.imageDataUrl) {
      window.pastryAPI.writeImageClipboard(this.entry.imageDataUrl);
    } else if (this.entry.htmlContent) {
      window.pastryAPI.writeRichClipboard({ text: this.entry.text, htmlContent: this.entry.htmlContent });
    } else {
      window.pastryAPI.writeClipboard(this.entry.text);
    }
    addToHistory({ text: this.entry.text, imageDataUrl: this.entry.imageDataUrl, htmlContent: this.entry.htmlContent });
    window.dispatchEvent(new CustomEvent('pastry:close'));
  }

  private _handlePaste(): void {
    window.pastryAPI.pasteItem({ text: this.entry.text, imageDataUrl: this.entry.imageDataUrl, htmlContent: this.entry.htmlContent });
  }

  private _handleEdit(): void {
    setEditTarget(this.entry);
  }

  private _handleUnpin(): void {
    setUnpinTarget(this.entry);
  }

  render() {
    const isImage = Boolean(this.entry.imageDataUrl);
    const preview = isImage
      ? html`<div class="thumbnail"><img src=${this.entry.imageDataUrl!} /></div>`
      : html`<div class="text" title=${this.entry.text}>${this.entry.text}</div>`;
    return html`
      <div class="row ${this.active ? 'active' : ''}" @click=${this._handlePaste}>
        <div class="info">
          <div class="name">${this.entry.name}</div>
          ${preview}
        </div>
        <div class="actions" @click=${(e: Event) => e.stopPropagation()}>
          <button @click=${this._handleCopy}>Copy</button>
          <button @click=${this._handlePaste}>Paste</button>
          <button class="edit" @click=${this._handleEdit}>Edit</button>
          <button class="unpin" @click=${this._handleUnpin}>Unpin</button>
        </div>
      </div>
    `;
  }
}
