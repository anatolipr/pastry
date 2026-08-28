import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction, allActionTags } from '../store/actions-store';
import './tags-input';
import './param-options-editor';

@customElement('text-action-dialog')
export class TextActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _text = '';
  @state() private _copyToClipboard = false;
  @state() private _tags: string[] = [];
  @state() private _paramOptions: Record<string, string[]> = {};
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 380px;
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
    textarea {
      width: 100%; box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; margin-bottom: 6px; font-family: inherit;
      resize: vertical; min-height: 100px;
    }
    input:focus, textarea:focus { border-color: var(--accent-pinned); }
    .hint { font-size: 11px; color: var(--text-muted); margin-bottom: 14px; line-height: 1.4; }
    .hint code { background: var(--bg-hover); border-radius: 3px; padding: 0 3px; font-size: 10px; }
    .copy-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .copy-row input[type=checkbox] { width: auto; margin: 0; cursor: pointer; accent-color: var(--accent-pinned); }
    .copy-row label { margin: 0; cursor: pointer; font-size: 12px; color: var(--text-secondary); }
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
    return newActionKind.get() === 'text' || editActionTarget.get()?.kind === 'text';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._text = editing?.text ?? '';
      this._copyToClipboard = editing?.copyToClipboard ?? false;
      this._tags = editing?.tags ?? [];
      this._paramOptions = editing?.paramOptions ?? {};
      this.shadowRoot?.querySelector<HTMLInputElement>('#text-name-input')?.focus();
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
    this._text = '';
    this._copyToClipboard = false;
    this._tags = [];
    this._paramOptions = {};
  }

  private _confirm(): void {
    if (!this._name.trim() || !this._text.trim()) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, text: this._text, copyToClipboard: this._copyToClipboard, tags: this._tags, paramOptions: this._paramOptions });
    } else {
      createAction({ name: this._name, kind: 'text', text: this._text, copyToClipboard: this._copyToClipboard, tags: this._tags, paramOptions: this._paramOptions });
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
          @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._close(); }}
        >
          <h3>${editActionTarget.get() ? 'Edit Text Action' : 'New Text Action'}</h3>
          <label for="text-name-input">Name</label>
          <input id="text-name-input" .value=${this._name} placeholder="Support Access Note"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label for="text-body-input">Text</label>
          <textarea id="text-body-input" .value=${this._text} placeholder="Hi ::clientName::, ..."
            @input=${(e: Event) => (this._text = (e.target as HTMLTextAreaElement).value)}></textarea>
          <p class="hint">Use <code>::name::</code> for a placeholder you'll fill in each time you run this action.</p>
          <div class="copy-row">
            <input id="text-copy-checkbox" type="checkbox" .checked=${this._copyToClipboard}
              @change=${(e: Event) => (this._copyToClipboard = (e.target as HTMLInputElement).checked)} />
            <label for="text-copy-checkbox">Copy to clipboard instead of inserting</label>
          </div>
          <label for="text-tags-input">Tags</label>
          <tags-input id="text-tags-input" .tags=${this._tags} .suggestions=${allActionTags.get()}
            @tags-changed=${(e: CustomEvent) => (this._tags = e.detail.tags)}></tags-input>
          <param-options-editor .text=${this._text} .paramOptions=${this._paramOptions}
            @param-options-changed=${(e: CustomEvent) => (this._paramOptions = e.detail.paramOptions)}></param-options-editor>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!this._name.trim() || !this._text.trim()} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
