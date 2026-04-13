import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import type { PinnedEntry } from '../shared-types';
import { setUnpinTarget, setEditTarget, addToHistory, openReminderDialog } from '../store/clipboard-store';

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
      background: var(--bg-hover);
    }
    .row.active {
      background: var(--bg-active-pinned);
      outline: 1px solid var(--accent-pinned);
    }
    .info {
      flex: 1;
      overflow: hidden;
    }
    .name {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-pinned);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .text {
      font-size: 11px;
      color: var(--text-secondary);
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
      border: 1px solid var(--border-soft);
      cursor: zoom-in;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 3px;
    }
    .tag {
      font-size: 10px;
      font-weight: 600;
      color: var(--accent-history);
      background: var(--accent-history-bg);
      border: 1px solid var(--accent-history);
      border-radius: 10px;
      padding: 1px 6px;
      white-space: nowrap;
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
    button.edit {
      color: var(--accent-history);
      border-color: var(--accent-history);
    }
    button.edit:hover {
      background: var(--bg-active-history);
    }
    button.remind {
      color: var(--accent-pinned);
      border-color: var(--accent-pinned);
    }
    button.remind:hover {
      background: var(--bg-active-pinned);
    }
    button.unpin {
      color: var(--accent-danger);
      border-color: var(--accent-danger);
    }
    button.unpin:hover {
      background: var(--bg-active-history);
    }
    .reminder-badge {
      font-size: 11px;
      margin-left: 4px;
      cursor: default;
    }
    .richtext-badge {
      font-size: 11px;
      margin-left: 4px;
      cursor: default;
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

  private _handleReminder(): void {
    openReminderDialog(this.entry);
  }

  private _handleImagePreview(e: Event): void {
    e.stopPropagation();
    window.pastryAPI.openImagePreview(this.entry.imageDataUrl!, this.entry.name || 'Image');
  }

  render() {
    const isImage = Boolean(this.entry.imageDataUrl);
    const preview = isImage
      ? html`<div class="thumbnail"><img src=${this.entry.imageDataUrl!} @click=${this._handleImagePreview} /></div>`
      : html`<div class="text" title=${this.entry.text}>${this.entry.text}</div>`;
    const hasReminder = Boolean(this.entry.reminderAt && this.entry.reminderAt > Date.now());
    const reminderTitle = hasReminder
      ? `Reminder: ${new Date(this.entry.reminderAt!).toLocaleString()}`
      : '';
    return html`
      <div class="row ${this.active ? 'active' : ''}" @click=${this._handlePaste}>
        <div class="info">
          <div class="name">
            ${this.entry.name}
            ${hasReminder ? html`<span class="reminder-badge" title=${reminderTitle}>🔔</span>` : ''}
            ${this.entry.htmlContent ? html`<span class="richtext-badge" title="Rich text / HTML">📝</span>` : ''}
          </div>
          ${preview}
          ${this.entry.tags && this.entry.tags.length > 0 ? html`
            <div class="tags">${this.entry.tags.map((t) => html`<span class="tag">${t}</span>`)}</div>
          ` : ''}
        </div>
        <div class="actions" @click=${(e: Event) => e.stopPropagation()}>
          <button @click=${this._handleCopy}>Copy</button>
          <button @click=${this._handlePaste}>Paste</button>
          <button class="edit" @click=${this._handleEdit}>Edit</button>
          <button class="remind" @click=${this._handleReminder}>Remind</button>
          <button class="unpin" @click=${this._handleUnpin}>Unpin</button>
        </div>
      </div>
    `;
  }
}
