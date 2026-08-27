import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction } from '../store/actions-store';

@customElement('terminal-action-dialog')
export class TerminalActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _command = '';
  @state() private _workingDirectory = '';
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 360px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
    input {
      width: 100%; box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; margin-bottom: 14px; font-family: inherit;
    }
    input:focus { border-color: var(--accent-pinned); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .confirm { background: var(--accent-pinned); color: #1a1a1e; border-color: var(--accent-pinned); font-weight: 600; }
    .confirm:disabled { opacity: 0.4; cursor: default; }
  `;

  private _isOpen(): boolean {
    return newActionKind.get() === 'terminal' || editActionTarget.get()?.kind === 'terminal';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._command = editing?.command ?? '';
      this._workingDirectory = editing?.workingDirectory ?? '';
      this.shadowRoot?.querySelector<HTMLInputElement>('#terminal-name-input')?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    newActionKind.set(null);
    editActionTarget.set(null);
    this._reset();
  }

  private _reset(): void {
    this._name = '';
    this._command = '';
    this._workingDirectory = '';
  }

  private _confirm(): void {
    if (!this._name.trim() || !this._command.trim()) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, command: this._command, workingDirectory: this._workingDirectory });
    } else {
      createAction({ name: this._name, kind: 'terminal', command: this._command, workingDirectory: this._workingDirectory });
    }
    this._close();
  }

  render() {
    if (!this._isOpen()) return html``;
    return html`
      <div
        class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._close(); delete el.dataset['dismissDown']; }}
      >
        <div
          class="dialog"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._confirm(); if (e.key === 'Escape') this._close(); }}
        >
          <h3>${editActionTarget.get() ? 'Edit Terminal Action' : 'New Terminal Action'}</h3>
          <label for="terminal-name-input">Name</label>
          <input id="terminal-name-input" .value=${this._name} placeholder="Pending Deploy"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label for="terminal-command-input">Command</label>
          <input id="terminal-command-input" .value=${this._command} placeholder="./pending-deploy.sh"
            @input=${(e: Event) => (this._command = (e.target as HTMLInputElement).value)} />
          <label for="terminal-workdir-input">Working Directory</label>
          <input id="terminal-workdir-input" .value=${this._workingDirectory} placeholder="/path/to/project"
            @input=${(e: Event) => (this._workingDirectory = (e.target as HTMLInputElement).value)} />
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!this._name.trim() || !this._command.trim()} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
