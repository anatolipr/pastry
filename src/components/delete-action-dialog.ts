import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { deleteActionTarget, deleteAction } from '../store/actions-store';

@customElement('delete-action-dialog')
export class DeleteActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 10px; font-size: 14px; color: var(--accent-danger); }
    p { font-size: 12px; color: var(--text-secondary); margin: 0 0 16px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button { border-radius: 5px; cursor: pointer; font-size: 12px; padding: 6px 14px; border: 1px solid var(--border-input-strong); }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .confirm { background: var(--accent-danger); color: #fff; border-color: var(--accent-danger); font-weight: 600; }
  `;

  private _close(): void { deleteActionTarget.set(null); }

  private _confirm(): void {
    const target = deleteActionTarget.get();
    if (target) deleteAction(target.id);
    this._close();
  }

  private _handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this._confirm();
    if (e.key === 'Escape') this._close();
  }

  updated() {
    const open = deleteActionTarget.get() !== null;
    if (open && !this._wasOpen) {
      this.shadowRoot?.querySelector<HTMLButtonElement>('.cancel')?.focus();
    }
    this._wasOpen = open;
  }

  render() {
    const target = deleteActionTarget.get();
    if (!target) return html``;
    return html`
      <div
        class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._close(); delete el.dataset['dismissDown']; }}
        @keydown=${(e: KeyboardEvent) => this._handleKeydown(e)}
      >
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Delete Action</h3>
          <p>Delete "${target.name}"? This can't be undone.</p>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" @click=${() => this._confirm()}>Delete</button>
          </div>
        </div>
      </div>
    `;
  }
}
