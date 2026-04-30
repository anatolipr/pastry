import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { isNewPinOpen, setNewPinOpen, pinNewItem, allTags, openReminderDialogCallback, setReminderOnPin } from '../store/clipboard-store';

@customElement('new-pin-dialog')
export class NewPinDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _text = '';
  @state() private _name = '';
  @state() private _tags: string[] = [];
  @state() private _tagInput = '';
  @state() private _tagSuggestions: string[] = [];
  @state() private _reminderAt: number | null = null;
  @state() private _hidden = false;
  private _wasOpen = false;

  updated() {
    const isOpen = isNewPinOpen.get();
    if (isOpen && !this._wasOpen) {
      this.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
    this._wasOpen = isOpen;
  }

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 320px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
    textarea {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 6px;
      font-family: inherit; resize: vertical; min-height: 72px;
    }
    textarea:focus { border-color: var(--accent-pinned); }
    .paste-hint {
      font-size: 11px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;
    }
    .paste-hint code {
      background: var(--bg-hover); border-radius: 3px; padding: 0 3px; font-size: 10px;
    }
    input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 16px;
    }
    input:focus { border-color: var(--accent-pinned); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong); transition: background 0.1s;
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .remind { background: transparent; color: var(--accent-pinned); border-color: var(--accent-pinned); }
    .remind:hover { background: var(--bg-active-pinned); }
    .confirm { background: var(--accent-pinned); color: #1a1a1e; border-color: var(--accent-pinned); font-weight: 600; }
    .confirm:hover { opacity: 0.85; }
    .confirm:disabled { opacity: 0.4; cursor: default; }
    .hidden-row {
      display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin-bottom: 16px;
    }
    .hidden-row input[type=checkbox] { width: auto; padding: 0; margin: 0; cursor: pointer; accent-color: var(--accent-pinned); flex-shrink: 0; }
    .hidden-row label { margin: 0; cursor: pointer; font-size: 12px; color: var(--text-secondary); }
    .reminder-preview {
      font-size: 11px; color: var(--accent-pinned); margin-bottom: 14px;
      padding: 5px 8px; background: var(--bg-active-pinned);
      border-radius: 4px; border: 1px solid var(--accent-pinned);
      display: flex; align-items: center; justify-content: space-between;
    }
    .reminder-preview button {
      background: none; border: none; color: var(--accent-danger); cursor: pointer;
      font-size: 12px; padding: 0 0 0 8px; border-radius: 0;
    }
    .tag-field {
      display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; padding: 5px 8px; min-height: 34px;
      cursor: text; margin-bottom: 16px; position: relative;
    }
    .tag-field:focus-within { border-color: var(--accent-pinned); }
    .pill {
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--bg-active-pinned); border: 1px solid var(--accent-pinned);
      border-radius: 12px; color: var(--accent-pinned); font-size: 11px; font-weight: 600;
      padding: 2px 8px 2px 10px; white-space: nowrap;
    }
    .pill-x {
      background: none; border: none; color: var(--accent-pinned); cursor: pointer;
      font-size: 13px; line-height: 1; padding: 0 0 0 2px; opacity: 0.7;
    }
    .pill-x:hover { opacity: 1; }
    .tag-input {
      flex: 1; min-width: 80px; background: transparent; border: none;
      color: var(--text-primary); font-size: 13px; outline: none; padding: 2px;
      font-family: inherit;
    }
    .suggestions {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: var(--bg-dialog); border: 1px solid var(--border-input-strong);
      border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      z-index: 200; overflow: hidden;
    }
    .suggestion { padding: 6px 12px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
    .suggestion:hover { background: var(--bg-active-pinned); color: var(--text-primary); }
  `;

  private _addTag(tag: string): void {
    const t = tag.trim();
    if (!t || this._tags.includes(t)) { this._tagInput = ''; this._tagSuggestions = []; return; }
    this._tags = [...this._tags, t];
    this._tagInput = '';
    this._tagSuggestions = [];
  }

  private _removeTag(tag: string): void {
    this._tags = this._tags.filter((t) => t !== tag);
  }

  private _onTagKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); e.stopPropagation(); this._addTag(this._tagInput); }
    else if (e.key === 'Tab' && this._tagInput.trim()) { e.preventDefault(); this._addTag(this._tagInput); }
    else if (e.key === 'Backspace' && !this._tagInput && this._tags.length > 0) { this._removeTag(this._tags[this._tags.length - 1]); }
    else if (e.key === 'Escape') { this._tagSuggestions = []; }
  }

  private _onTagInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this._tagInput = val;
    const q = val.trim().toLowerCase();
    this._tagSuggestions = q
      ? allTags.get().filter((s) => s.toLowerCase().includes(q) && !this._tags.includes(s))
      : [];
  }

  private _handleConfirm(): void {
    if (!this._text.trim()) return;
    if (this._tagInput.trim()) this._addTag(this._tagInput);
    const id = pinNewItem(this._text, this._name, this._tags, this._hidden);
    if (id && this._reminderAt) setReminderOnPin(id, this._reminderAt);
    this._reset();
  }

  private _handleCancel(): void {
    setNewPinOpen(false);
    this._reset();
  }

  private _reset(): void {
    this._text = '';
    this._name = '';
    this._tags = [];
    this._tagInput = '';
    this._tagSuggestions = [];
    this._reminderAt = null;
    this._hidden = false;
  }

  render() {
    if (!isNewPinOpen.get()) return html``;

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>New pin</h3>
          <label for="new-pin-text">Content</label>
          <textarea
            id="new-pin-text"
            .value=${this._text}
            placeholder="Enter text to pin…"
            @input=${(e: Event) => { this._text = (e.target as HTMLTextAreaElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._handleCancel(); }}
            autofocus
          ></textarea>
          <p class="paste-hint">Tip: use <code>[TAB]</code> or <code>[ENTER]</code> to press a key between pastes — e.g. <code>username[TAB]password</code></p>
          <label for="new-pin-name">Label (optional)</label>
          <input
            id="new-pin-name"
            type="text"
            .value=${this._name}
            placeholder=${this._text.trim().slice(0, 30) || 'Label…'}
            @input=${(e: Event) => { this._name = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._handleConfirm(); if (e.key === 'Escape') this._handleCancel(); }}
          />
          <label>Tags (optional)</label>
          <div class="tag-field" @click=${() => this.shadowRoot?.querySelector<HTMLInputElement>('.tag-input')?.focus()}>
            ${this._tags.map((tag) => html`
              <span class="pill">${tag}
                <button class="pill-x" @click=${(e: Event) => { e.stopPropagation(); this._removeTag(tag); }} tabindex="-1">×</button>
              </span>`)}
            <input class="tag-input" type="text" .value=${this._tagInput}
              placeholder=${this._tags.length === 0 ? 'Add tag…' : ''}
              @input=${this._onTagInput}
              @keydown=${this._onTagKeydown}
              @blur=${() => setTimeout(() => { this._tagSuggestions = []; if (this._tagInput.trim()) this._addTag(this._tagInput); }, 150)}
            />
            ${this._tagSuggestions.length > 0 ? html`
              <div class="suggestions">
                ${this._tagSuggestions.map((s) => html`
                  <div class="suggestion" @mousedown=${(e: Event) => { e.preventDefault(); this._addTag(s); }}>${s}</div>`)}
              </div>` : ''}
          </div>
          ${this._reminderAt ? html`
            <div class="reminder-preview">
              <span>🔔 ${new Date(this._reminderAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <button @click=${() => { this._reminderAt = null; }}>✕</button>
            </div>
          ` : ''}
          <div class="hidden-row">
            <input type="checkbox" id="new-pin-hidden" .checked=${this._hidden}
              @change=${(e: Event) => { this._hidden = (e.target as HTMLInputElement).checked; }} />
            <label for="new-pin-hidden">Hide content (show as [hidden] in list)</label>
          </div>
          <div class="actions">
            <button class="remind" @click=${() => openReminderDialogCallback(
              this._name.trim() || this._text.trim().slice(0, 30) || 'New pin',
              this._reminderAt ?? undefined,
              (ts) => { this._reminderAt = ts; },
            )}>🔔 Remind</button>
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" ?disabled=${!this._text.trim()} @click=${this._handleConfirm}>Pin</button>
          </div>
        </div>
      </div>
    `;
  }
}
