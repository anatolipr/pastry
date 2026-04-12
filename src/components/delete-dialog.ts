import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { deleteTarget, isDeleteDialogOpen, deleteHistoryItem, setDeleteTarget } from '../store/clipboard-store';

@customElement('delete-dialog')
export class DeleteDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: var(--overlay-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog);
      border: 1px solid var(--border-dialog);
      border-radius: 10px;
      padding: 20px 24px;
      width: 300px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--accent-danger);
    }
    .preview {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .image-preview {
      margin-bottom: 18px;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid var(--border-soft);
      display: inline-block;
    }
    .image-preview img {
      max-height: 60px;
      max-width: 252px;
      object-fit: contain;
      display: block;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    button {
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      padding: 6px 14px;
      border: 1px solid var(--border-input-strong);
      transition: background 0.1s;
    }
    .cancel {
      background: transparent;
      color: var(--text-secondary);
    }
    .cancel:hover {
      background: var(--bg-hover);
    }
    .confirm {
      background: var(--accent-danger);
      color: #fff;
      border-color: var(--accent-danger);
      font-weight: 600;
    }
    .confirm:hover {
      opacity: 0.85;
    }
  `;

  private _handleConfirm(): void {
    const entry = deleteTarget.get();
    if (!entry) return;
    deleteHistoryItem(entry.id);
  }

  private _handleCancel(): void {
    setDeleteTarget(null);
  }

  private _handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this._handleConfirm();
    if (e.key === 'Escape') this._handleCancel();
  }

  render() {
    if (!isDeleteDialogOpen.get()) return html``;

    const entry = deleteTarget.get()!;
    const isImage = Boolean(entry.imageDataUrl);
    const preview = isImage
      ? html`<div class="image-preview"><img src=${entry.imageDataUrl!} /></div>`
      : html`<div class="preview">${entry.text}</div>`;

    return html`
      <div class="overlay"
           @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
           @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}
           @keydown=${this._handleKeydown}>
        <div class="dialog">
          <h3>Delete this item?</h3>
          ${preview}
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Delete</button>
          </div>
        </div>
      </div>
    `;
  }
}
