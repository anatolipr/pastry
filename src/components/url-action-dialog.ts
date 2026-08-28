import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction, allActionTags } from '../store/actions-store';
import './tags-input';
import './param-options-editor';

@customElement('url-action-dialog')
export class UrlActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _url = '';
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
    return newActionKind.get() === 'url' || editActionTarget.get()?.kind === 'url';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._url = editing?.url ?? '';
      this._tags = editing?.tags ?? [];
      this._paramOptions = editing?.paramOptions ?? {};
      this.shadowRoot?.querySelector<HTMLInputElement>('#url-name-input')?.focus();
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
    this._url = '';
    this._tags = [];
    this._paramOptions = {};
  }

  private _confirm(): void {
    if (!this._name.trim() || !this._url.trim()) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, url: this._url, tags: this._tags, paramOptions: this._paramOptions });
    } else {
      createAction({ name: this._name, kind: 'url', url: this._url, tags: this._tags, paramOptions: this._paramOptions });
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
          <h3>${editActionTarget.get() ? 'Edit URL Action' : 'New URL Action'}</h3>
          <label for="url-name-input">Name</label>
          <input id="url-name-input" .value=${this._name} placeholder="Check Deployed Branch"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label for="url-value-input">URL</label>
          <input id="url-value-input" .value=${this._url} placeholder="https://app.impact.com/monitor-stats/ma_manifest.branch"
            @input=${(e: Event) => (this._url = (e.target as HTMLInputElement).value)} />
          <label for="url-tags-input">Tags</label>
          <tags-input id="url-tags-input" .tags=${this._tags} .suggestions=${allActionTags.get()}
            @tags-changed=${(e: CustomEvent) => (this._tags = e.detail.tags)}></tags-input>
          <param-options-editor .text=${this._url} .paramOptions=${this._paramOptions}
            @param-options-changed=${(e: CustomEvent) => (this._paramOptions = e.detail.paramOptions)}></param-options-editor>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!this._name.trim() || !this._url.trim()} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
