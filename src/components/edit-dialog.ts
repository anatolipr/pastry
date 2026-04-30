import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ref, createRef } from 'lit/directives/ref.js';
import { SignalWatcher } from 'avosignals';
import { editTarget, isEditDialogOpen, updatePinnedItem, setEditTarget, allTags, openReminderDialog } from '../store/clipboard-store';

@customElement('edit-dialog')
export class EditDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _text = '';
  @state() private _htmlContent = '';
  @state() private _tags: string[] = [];
  @state() private _tagInput = '';
  @state() private _tagSuggestions: string[] = [];
  @state() private _hidden = false;
  @state() private _seeded = false;
  private _richEditorRef = createRef<HTMLDivElement>();
  private _pendingRichSeed = false;

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
    h3 { margin: 0 0 16px; font-size: 14px; color: var(--accent-history); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; }
    input, textarea {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 14px;
    }
    input:focus, textarea:focus { border-color: var(--accent-history); }
    textarea { resize: vertical; min-height: 72px; font-family: inherit; }
    .rich-editor {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 14px;
      min-height: 72px; max-height: 200px; overflow-y: auto;
      font-family: inherit; line-height: 1.5; word-break: break-word;
    }
    .rich-editor:focus { border-color: var(--accent-history); }
    .rich-editor:empty::before {
      content: attr(data-placeholder); color: var(--text-muted); pointer-events: none;
    }
    .image-preview {
      margin-bottom: 14px; border-radius: 5px; overflow: hidden;
      border: 1px solid var(--border-soft); display: inline-block;
    }
    .image-preview img { max-height: 80px; max-width: 312px; object-fit: contain; display: block; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .hidden-row {
      display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin-bottom: 14px;
    }
    .hidden-row input[type=checkbox] { width: auto; padding: 0; margin: 0; cursor: pointer; accent-color: var(--accent-history); flex-shrink: 0; }
    .hidden-row label { margin: 0; cursor: pointer; font-size: 12px; color: var(--text-secondary); }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong); transition: background 0.1s;
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .remind { background: transparent; color: var(--accent-pinned); border-color: var(--accent-pinned); }
    .remind:hover { background: var(--bg-active-pinned); }
    .confirm { background: var(--save-btn-bg); color: var(--save-btn-color); border-color: var(--save-btn-bg); font-weight: 600; }
    .confirm:hover { background: var(--save-btn-hover); }
    .tag-field {
      display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; padding: 5px 8px; min-height: 34px;
      cursor: text; margin-bottom: 14px; position: relative;
    }
    .tag-field:focus-within { border-color: var(--accent-history); }
    .pill {
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--accent-history-bg); border: 1px solid var(--accent-history);
      border-radius: 12px; color: var(--accent-history); font-size: 11px; font-weight: 600;
      padding: 2px 8px 2px 10px; white-space: nowrap;
    }
    .pill-x {
      background: none; border: none; color: var(--accent-history); cursor: pointer;
      font-size: 13px; line-height: 1; padding: 0 0 0 2px; opacity: 0.7;
    }
    .pill-x:hover { opacity: 1; }
    .tag-input {
      flex: 1; min-width: 80px; background: transparent; border: none;
      color: var(--text-primary); font-size: 13px; outline: none; padding: 2px;
      font-family: inherit; margin-bottom: 0;
    }
    .suggestions {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: var(--bg-dialog); border: 1px solid var(--border-input-strong);
      border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      z-index: 200; overflow: hidden;
    }
    .suggestion {
      padding: 6px 12px; font-size: 12px; color: var(--text-secondary); cursor: pointer;
    }
    .suggestion:hover { background: var(--bg-active-history); color: var(--text-primary); }
    .paste-hint {
      font-size: 11px; color: var(--text-muted); margin: -8px 0 12px; line-height: 1.4;
    }
    .paste-hint code {
      background: var(--bg-hover); border-radius: 3px; padding: 0 3px; font-size: 10px;
    }
  `;

  private _seed(): void {
    const entry = editTarget.get();
    if (entry && !this._seeded) {
      this._name = entry.name;
      this._text = entry.text;
      this._htmlContent = entry.htmlContent ?? '';
      this._tags = [...(entry.tags ?? [])];
      this._hidden = entry.hidden ?? false;
      this._seeded = true;
      this._pendingRichSeed = Boolean(entry.htmlContent);
    }
    if (!entry) this._seeded = false;
  }

  override updated(): void {
    if (this._pendingRichSeed) {
      const div = this._richEditorRef.value;
      if (div) {
        div.innerHTML = this._htmlContent;
        this._pendingRichSeed = false;
      }
    }
  }

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
    const entry = editTarget.get();
    if (!entry) return;
    // Commit any pending tag text
    if (this._tagInput.trim()) this._addTag(this._tagInput);
    let textToSave = this._text;
    let htmlToSave: string | undefined;
    if (entry.htmlContent) {
      const div = this._richEditorRef.value;
      if (div) {
        htmlToSave = div.innerHTML;
        textToSave = div.textContent ?? '';
      } else {
        htmlToSave = this._htmlContent;
      }
    }
    updatePinnedItem(entry.id, this._name, textToSave, this._tags, htmlToSave, this._hidden);
    this._seeded = false;
  }

  private _handleCancel(): void {
    setEditTarget(null);
    this._seeded = false;
    this._tagInput = '';
    this._tagSuggestions = [];
  }

  render() {
    if (!isEditDialogOpen.get()) return html``;
    this._seed();
    const entry = editTarget.get()!;
    const hasReminder = Boolean(entry.reminderAt && entry.reminderAt > Date.now());
    const isImage = Boolean(entry.imageDataUrl);
    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>Edit Pinned Item${hasReminder ? html` <span title="Reminder set">🔔</span>` : ''}</h3>
          <label>Label</label>
          <input type="text" .value=${this._name}
            @input=${(e: Event) => { this._name = (e.target as HTMLInputElement).value; }}
            placeholder="Label for this pin"
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
          ${isImage
            ? html`<div class="image-preview"><img src=${entry.imageDataUrl!} alt=${entry.name || 'Image'} /></div>`
            : entry.htmlContent
              ? html`
                <label>Value (Rich Text)</label>
                <div class="rich-editor" contenteditable="true"
                  ${ref(this._richEditorRef)}
                  data-placeholder="Clipboard value"
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._handleCancel(); }}
                ></div>`
              : html`
                <label>Value</label>
                <textarea .value=${this._text}
                  @input=${(e: Event) => { this._text = (e.target as HTMLTextAreaElement).value; }}
                  placeholder="Clipboard value"
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._handleCancel(); }}
                ></textarea>
                <p class="paste-hint">Tip: use <code>[TAB]</code> or <code>[ENTER]</code> to press a key between pastes — e.g. <code>username[TAB]password</code></p>`}
          <div class="hidden-row">
            <input type="checkbox" id="edit-hidden" .checked=${this._hidden}
              @change=${(e: Event) => { this._hidden = (e.target as HTMLInputElement).checked; }} />
            <label for="edit-hidden">Hide content (show as [hidden] in list)</label>
          </div>
          <div class="actions">
            <button class="remind" @click=${() => openReminderDialog(entry)}>🔔 Remind</button>
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
