import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { editTarget, isEditDialogOpen, updatePinnedItem, setEditTarget } from '../store/clipboard-store';

@customElement('edit-dialog')
export class EditDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _text = '';
  @state() private _seeded = false;

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
      width: 360px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 16px;
      font-size: 14px;
      color: #69b4ff;
    }
    label {
      display: block;
      font-size: 12px;
      color: #aaa;
      margin-bottom: 5px;
    }
    input, textarea {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 5px;
      color: #e0e0e0;
      font-size: 13px;
      padding: 7px 10px;
      outline: none;
      margin-bottom: 14px;
    }
    input:focus, textarea:focus {
      border-color: #69b4ff;
    }
    textarea {
      resize: vertical;
      min-height: 72px;
      font-family: inherit;
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
      background: #69b4ff;
      color: #1a1a1e;
      border-color: #69b4ff;
      font-weight: 600;
    }
    .confirm:hover {
      background: #8acaff;
    }
  `;

  /** Seed local state from the signal when the dialog opens. */
  private _seed(): void {
    const entry = editTarget.get();
    if (entry && !this._seeded) {
      this._name = entry.name;
      this._text = entry.text;
      this._seeded = true;
    }
    if (!entry) this._seeded = false;
  }

  private _handleConfirm(): void {
    const entry = editTarget.get();
    if (!entry) return;
    updatePinnedItem(entry.id, this._name, this._text);
    this._seeded = false;
  }

  private _handleCancel(): void {
    setEditTarget(null);
    this._seeded = false;
  }

  render() {
    if (!isEditDialogOpen.get()) return html``;
    this._seed();
    return html`
      <div class="overlay" @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }} @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>Edit Pinned Item</h3>
          <label>Label</label>
          <input
            type="text"
            .value=${this._name}
            @input=${(e: Event) => { this._name = (e.target as HTMLInputElement).value; }}
            placeholder="Label for this pin"
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._handleConfirm(); if (e.key === 'Escape') this._handleCancel(); }}
          />
          <label>Value</label>
          <textarea
            .value=${this._text}
            @input=${(e: Event) => { this._text = (e.target as HTMLTextAreaElement).value; }}
            placeholder="Clipboard value"
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._handleCancel(); }}
          ></textarea>
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
