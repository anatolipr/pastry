import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

let _instanceCounter = 0;

/**
 * A pills-style tag input with autocomplete from existing tags.
 * Emits a 'tags-changed' CustomEvent with detail: { tags: string[] } when tags change.
 *
 * The suggestions menu is a `popover="manual"` element positioned via CSS anchor
 * positioning (see the `making-dropdowns`/`lit-autocomplete-combobox` skills): it's
 * "manual" rather than "auto" because the anchor is a text input, not a
 * popovertarget-eligible button — `auto`'s own light-dismiss would close the menu
 * immediately after opening. Outside-click and Escape are replicated manually below.
 */
@customElement('tags-input')
export class TagsInput extends LitElement {
  @property({ type: Array }) tags: string[] = [];
  @property({ type: Array }) suggestions: string[] = [];
  @property({ type: String }) placeholder = 'Add tag…';

  @state() private _inputValue = '';
  @state() private _showSuggestions = false;
  @state() private _highlightedIdx = -1;

  private _anchorName = `--tags-input-${++_instanceCounter}`;
  private _onDocumentClick = (e: MouseEvent): void => {
    if (!e.composedPath().includes(this)) this._closeSuggestions();
  };

  static styles = css`
    :host {
      display: block;
      margin-bottom: 14px;
    }
    .container {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      background: var(--bg-input);
      border: 1px solid var(--border-input-strong);
      border-radius: 5px;
      padding: 5px 8px;
      cursor: text;
      min-height: auto;
    }
    .container:focus-within {
      border-color: var(--accent-history);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--accent-history-bg);
      border: 1px solid var(--accent-history);
      border-radius: 12px;
      color: var(--accent-history);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px 2px 10px;
      white-space: nowrap;
    }
    .pill-remove {
      background: none;
      border: none;
      color: var(--accent-history);
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 0 0 0 2px;
      opacity: 0.7;
      display: flex;
      align-items: center;
    }
    .pill-remove:hover {
      opacity: 1;
    }
    .input {
      flex: 1;
      min-width: 80px;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      padding: 2px 2px;
      font-family: inherit;
    }
    .suggestions {
      position: fixed;
      margin: 0;
      inset: auto;
      top: anchor(bottom);
      left: anchor(left);
      width: anchor-size(width);
      position-try-fallbacks: flip-block;
      max-height: 200px;
      background: var(--bg-dialog);
      border: 1px solid var(--border-input-strong);
      border-radius: 6px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
      overflow-y: auto;
      overflow-x: hidden;
    }
    .suggestions:popover-open { margin-top: 4px; }
    .suggestion {
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
    }
    .suggestion:hover,
    .suggestion.highlighted {
      background: var(--bg-active-history);
      color: var(--text-primary);
    }
    .create-option {
      font-style: italic;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('click', this._onDocumentClick);
  }

  disconnectedCallback(): void {
    document.removeEventListener('click', this._onDocumentClick);
    super.disconnectedCallback();
  }

  private _openSuggestions(): void {
    if (this._filteredSuggestions.length === 0 && !this._canCreate) return;
    this._showSuggestions = true;
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelector<HTMLElement>('.suggestions')?.showPopover();
    });
  }

  private _closeSuggestions(): void {
    this._showSuggestions = false;
    this._highlightedIdx = -1;
    this.shadowRoot?.querySelector<HTMLElement>('.suggestions')?.hidePopover();
  }

  private static readonly MAX_SUGGESTIONS = 8;

  private get _filteredSuggestions(): string[] {
    const q = this._inputValue.trim().toLowerCase();
    const available = this.suggestions.filter((s) => !this.tags.includes(s));
    const matched = q ? available.filter((s) => s.toLowerCase().includes(q)) : available;
    return matched.slice(0, TagsInput.MAX_SUGGESTIONS);
  }

  /** True when the current input doesn't exactly match an existing (unselected) tag,
   * so a "Create '<input>'" row should be offered alongside any fuzzy suggestions. */
  private get _canCreate(): boolean {
    const t = this._inputValue.trim();
    if (!t || this.tags.includes(t)) return false;
    return !this.suggestions.some((s) => s.toLowerCase() === t.toLowerCase());
  }

  /** Current tags — readable by parent after interaction, no events needed. */
  get currentTags(): string[] { return this.tags; }

  private _updateTags(next: string[]): void {
    this.tags = next;
    this.dispatchEvent(new CustomEvent('tags-changed', { detail: { tags: next }, bubbles: true, composed: true }));
  }

  private _addTag = (tag: string): void => {
    const t = tag.trim();
    if (!t || this.tags.includes(t)) { this._inputValue = ''; return; }
    this._inputValue = '';
    this._closeSuggestions();
    this._updateTags([...this.tags, t]);
  };

  private _removeTag = (tag: string): void => {
    this._updateTags(this.tags.filter((t) => t !== tag));
  };

  private _handleKeydown = (e: KeyboardEvent): void => {
    const suggestions = this._filteredSuggestions;
    const rowCount = suggestions.length + (this._canCreate ? 1 : 0);
    if (e.key === 'Tab' && this._inputValue.trim()) {
      e.preventDefault();
      e.stopPropagation();
      if (this._highlightedIdx >= 0 && suggestions[this._highlightedIdx]) {
        this._addTag(suggestions[this._highlightedIdx]);
      } else {
        this._addTag(this._inputValue);
      }
    } else if (e.key === ',' && this._inputValue.trim()) {
      e.preventDefault();
      e.stopPropagation();
      this._addTag(this._inputValue);
    } else if (e.key === 'Enter' && (this._highlightedIdx >= 0 || this._inputValue.trim())) {
      // Only intercept Enter when there's something to commit (a highlighted
      // suggestion or typed text) — otherwise let it bubble so the dialog's
      // own Enter-to-confirm/run still works when the tags field is merely
      // focused but empty.
      e.preventDefault();
      e.stopPropagation();
      if (this._highlightedIdx >= 0 && suggestions[this._highlightedIdx]) {
        this._addTag(suggestions[this._highlightedIdx]);
      } else {
        this._addTag(this._inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this._openSuggestions();
      this._highlightedIdx = Math.min(this._highlightedIdx + 1, rowCount - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this._openSuggestions();
      this._highlightedIdx = Math.max(this._highlightedIdx - 1, -1);
    } else if (e.key === 'Backspace' && !this._inputValue && this.tags.length > 0) {
      e.stopPropagation();
      this._removeTag(this.tags[this.tags.length - 1]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      this._closeSuggestions();
    }
  };

  private _handleInput = (e: Event): void => {
    this._inputValue = (e.target as HTMLInputElement).value;
    this._highlightedIdx = -1;
    this._openSuggestions();
  };

  private _handleBlur = (): void => {
    // Delay so click on suggestion fires first
    setTimeout(() => {
      this._closeSuggestions();
      if (this._inputValue.trim()) {
        this._addTag(this._inputValue);
      }
    }, 150);
  };

  private _focusInput = (): void => {
    this.shadowRoot?.querySelector<HTMLInputElement>('.input')?.focus();
  };

  render() {
    const suggestions = this._filteredSuggestions;
    const canCreate = this._canCreate;
    if (this._showSuggestions && suggestions.length === 0 && !canCreate) this._closeSuggestions();
    return html`
      <div class="container" style=${`anchor-name: ${this._anchorName}`} @click=${this._focusInput}>
        ${this.tags.map((tag) => html`
          <span class="pill">
            ${tag}
            <button class="pill-remove" @click=${(e: Event) => { e.stopPropagation(); this._removeTag(tag); }} tabindex="-1">×</button>
          </span>
        `)}
        <input
          class="input"
          type="text"
          .value=${this._inputValue}
          placeholder=${this.tags.length === 0 ? this.placeholder : ''}
          @input=${this._handleInput}
          @keydown=${this._handleKeydown}
          @focus=${() => this._openSuggestions()}
          @blur=${this._handleBlur}
        />
      </div>
      <div class="suggestions" popover="manual" style=${`position-anchor: ${this._anchorName}`}>
        ${suggestions.map((s, i) => html`
          <div
            class="suggestion ${i === this._highlightedIdx ? 'highlighted' : ''}"
            @mousedown=${(e: Event) => { e.preventDefault(); this._addTag(s); }}
          >${s}</div>
        `)}
        ${canCreate ? html`
          <div
            class="suggestion create-option ${suggestions.length === this._highlightedIdx ? 'highlighted' : ''}"
            @mousedown=${(e: Event) => { e.preventDefault(); this._addTag(this._inputValue); }}
          >"${this._inputValue.trim()}" doesn't exist. Add it?</div>
        ` : ''}
      </div>
    `;
  }
}
