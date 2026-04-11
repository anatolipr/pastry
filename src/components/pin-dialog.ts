import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { pinTarget, isPinDialogOpen, pinItem, setPinTarget } from '../store/clipboard-store';

@customElement('pin-dialog')
export class PinDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog {
      background: #2a2a2e;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 20px 24px;
      width: 320px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 8px;
      font-size: 14px;
      color: #f0a840;
    }
    .preview {
      font-size: 11px;
      color: #888;
      margin-bottom: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .image-preview {
      margin-bottom: 14px;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
      display: inline-block;
    }
    .image-preview img {
      max-height: 80px;
      max-width: 272px;
      object-fit: contain;
      display: block;
    }
    label {
      display: block;
      font-size: 12px;
      color: #aaa;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 5px;
      color: #e0e0e0;
      font-size: 13px;
      padding: 7px 10px;
      outline: none;
      margin-bottom: 16px;
    }
    input:focus {
      border-color: #f0a840;
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
      border: 1px solid rgba(255, 255, 255, 0.15);
      transition: background 0.1s;
    }
    .cancel {
      background: transparent;
      color: #aaa;
    }
    .cancel:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .confirm {
      background: #f0a840;
      color: #1a1a1e;
      border-color: #f0a840;
      font-weight: 600;
    }
    .confirm:hover {
      background: #f8bc60;
    }
  `;

  private _handleConfirm(): void {
    const entry = pinTarget.get();
    if (!entry) return;
    pinItem(entry, this._name);
    this._name = '';
  }

  private _handleCancel(): void {
    setPinTarget(null);
    this._name = '';
  }

  private _handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this._handleConfirm();
    if (e.key === 'Escape') this._handleCancel();
  }

  render() {
    if (!isPinDialogOpen.get()) return html``;

    const entry = pinTarget.get()!;
    const isImage = Boolean(entry.imageDataUrl);
    const placeholder = isImage ? 'Image' : (entry.text.slice(0, 30) + (entry.text.length > 30 ? '…' : ''));
    if (!this._name && isImage) this._name = 'Image';

    return html`
      <div class="overlay" @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }} @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>Pin this item</h3>
          ${isImage
            ? html`<div class="image-preview"><img src=${entry.imageDataUrl!} /></div>`
            : html`<div class="preview">${entry.text}</div>`}
          <label for="pin-name">Label (optional)</label>
          <input
            id="pin-name"
            type="text"
            .value=${this._name}
            placeholder=${placeholder}
            @input=${(e: Event) => { this._name = (e.target as HTMLInputElement).value; }}
            @keydown=${this._handleKeydown}
            autofocus
          />
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Pin</button>
          </div>
        </div>
      </div>
    `;
  }
}
