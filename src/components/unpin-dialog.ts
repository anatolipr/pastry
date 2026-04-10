import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { unpinTarget, isUnpinDialogOpen, unpinItem, setUnpinTarget } from '../store/clipboard-store';

@customElement('unpin-dialog')
export class UnpinDialog extends LitElement {
  private watcher = new SignalWatcher(this);

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
      width: 300px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 10px;
      font-size: 14px;
      color: #e05a5a;
    }
    p {
      font-size: 12px;
      color: #aaa;
      margin: 0 0 18px;
      line-height: 1.5;
    }
    .name {
      color: #e0e0e0;
      font-weight: 600;
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
      background: #e05a5a;
      color: #fff;
      border-color: #e05a5a;
      font-weight: 600;
    }
    .confirm:hover {
      background: #ea7070;
    }
  `;

  private _handleConfirm(): void {
    const entry = unpinTarget.get();
    if (!entry) return;
    unpinItem(entry.id);
  }

  private _handleCancel(): void {
    setUnpinTarget(null);
  }

  render() {
    if (!isUnpinDialogOpen.get()) return html``;

    const entry = unpinTarget.get()!;

    return html`
      <div class="overlay" @click=${(e: MouseEvent) => { if (e.target === e.currentTarget) this._handleCancel(); }}>
        <div class="dialog">
          <h3>Remove pin?</h3>
          <p>
            Remove the pin <span class="name">"${entry.name}"</span>? This cannot be undone.
          </p>
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Remove</button>
          </div>
        </div>
      </div>
    `;
  }
}
