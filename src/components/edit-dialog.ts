import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { editTarget, isEditDialogOpen, updatePinnedItem, setEditTarget, allTags } from '../store/clipboard-store';

@customElement('edit-dialog')
export class EditDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _text = '';
  @state() private _tags: string[] = [];
  @state() private _tagInput = '';
  @state() private _tagSuggestions: string[] = [];
  @state() private _seeded = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: #2a2a2e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px; padding: 20px 24px; width: 360px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 16px; font-size: 14px; color: #69b4ff; }
    label { display: block; font-size: 12px; color: #aaa; margin-bottom: 5px; }
    input, textarea {
      width: 100%; box-sizing: border-box;
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px; color: #e0e0e0; font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 14px;
    }
    input:focus, textarea:focus { border-color: #69b4ff; }
    textarea { resize: vertical; min-height: 72px; font-family: inherit; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid rgba(255,255,255,0.15); transition: background 0.1s;
    }
    .cancel { background: transparent; color: #aaa; }
    .cancel:hover { background: rgba(255,255,255,0.08); }
    .confirm { background: #69b4ff; color: #1a1a1e; border-color: #69b4ff; font-weight: 600; }
    .confirm:hover { background: #8acaff; }
    .tag-field {
      display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px; padding: 5px 8px; min-height: 34px;
      cursor: text; margin-bottom: 14px; position: relative;
    }
    .tag-field:focus-within { border-color: #69b4ff; }
    .pill {
      display: inline-flex; align-items: center; gap: 4px;
      background: rgba(105,180,255,0.18); border: 1px solid rgba(105,180,255,0.35);
      border-radius: 12px; color: #69b4ff; font-size: 11px; font-weight: 600;
      padding: 2px 8px 2px 10px; white-space: nowrap;
    }
    .pill-x {
      background: none; border: none; color: #69b4ff; cursor: pointer;
      font-size: 13px; line-height: 1; padding: 0 0 0 2px; opacity: 0.7;
    }
    .pill-x:hover { opacity: 1; }
    .tag-input {
      flex: 1; min-width: 80px; background: transparent; border: none;
      color: #e0e0e0; font-size: 13px; outline: none; padding: 2px;
      font-family: inherit; margin-bottom: 0;
    }
    .suggestions {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: #2a2a2e; border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      z-index: 200; overflow: hidden;
    }
    .suggestion {
      padding: 6px 12px; font-size: 12px; color: #ccc; cursor: pointer;
    }
    .suggestion:hover { background: rgba(105,180,255,0.15); color: #fff; }
  `;

  private _seed(): void {
    const entry = editTarget.get();
    if (entry && !this._seeded) {
      this._name = entry.name;
      this._text = entry.text;
      this._tags = [...(entry.tags ?? [])];
      this._seeded = true;
    }
    if (!entry) this._seeded = false;
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
    updatePinnedItem(entry.id, this._name, this._text, this._tags);
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
    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>Edit Pinned Item</h3>
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
              @blur=${() => setTimeout(() => { this._tagSuggestions = []; }, 150)}
            />
            ${this._tagSuggestions.length > 0 ? html`
              <div class="suggestions">
                ${this._tagSuggestions.map((s) => html`
                  <div class="suggestion" @mousedown=${(e: Event) => { e.preventDefault(); this._addTag(s); }}>${s}</div>`)}
              </div>` : ''}
          </div>
          <label>Value</label>
          <textarea .value=${this._text}
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
