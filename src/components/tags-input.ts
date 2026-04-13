import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * A pills-style tag input with autocomplete from existing tags.
 * Emits a 'tags-changed' CustomEvent with detail: { tags: string[] } when tags change.
 */
@customElement('tags-input')
export class TagsInput extends LitElement {
  @property({ type: Array }) tags: string[] = [];
  @property({ type: Array }) suggestions: string[] = [];
  @property({ type: String }) placeholder = 'Add tag…';

  @state() private _inputValue = '';
  @state() private _showSuggestions = false;
  @state() private _highlightedIdx = -1;

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
      position: relative;
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
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--bg-dialog);
      border: 1px solid var(--border-input-strong);
      border-radius: 6px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
      z-index: 200;
      overflow: hidden;
    }
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
  `;

  private get _filteredSuggestions(): string[] {
    const q = this._inputValue.trim().toLowerCase();
    if (!q) return [];
    return this.suggestions.filter(
      (s) => s.toLowerCase().includes(q) && !this.tags.includes(s),
    );
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
    this._showSuggestions = false;
    this._highlightedIdx = -1;
    this._updateTags([...this.tags, t]);
  };

  private _removeTag = (tag: string): void => {
    this._updateTags(this.tags.filter((t) => t !== tag));
  };

  private _handleKeydown = (e: KeyboardEvent): void => {
    const suggestions = this._filteredSuggestions;
    if (e.key === 'Tab' && this._inputValue.trim()) {
      e.preventDefault();
      if (this._highlightedIdx >= 0 && suggestions[this._highlightedIdx]) {
        this._addTag(suggestions[this._highlightedIdx]);
      } else {
        this._addTag(this._inputValue);
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (this._highlightedIdx >= 0 && suggestions[this._highlightedIdx]) {
        this._addTag(suggestions[this._highlightedIdx]);
      } else {
        this._addTag(this._inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._highlightedIdx = Math.min(this._highlightedIdx + 1, suggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._highlightedIdx = Math.max(this._highlightedIdx - 1, -1);
    } else if (e.key === 'Backspace' && !this._inputValue && this.tags.length > 0) {
      this._removeTag(this.tags[this.tags.length - 1]);
    } else if (e.key === 'Escape') {
      this._showSuggestions = false;
      this._highlightedIdx = -1;
    }
  };

  private _handleInput = (e: Event): void => {
    this._inputValue = (e.target as HTMLInputElement).value;
    this._showSuggestions = true;
    this._highlightedIdx = -1;
  };

  private _handleBlur = (): void => {
    // Delay so click on suggestion fires first
    setTimeout(() => {
      this._showSuggestions = false;
      this._highlightedIdx = -1;
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
    return html`
      <div class="container" @click=${this._focusInput}>
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
          @focus=${() => { this._showSuggestions = true; }}
          @blur=${this._handleBlur}
        />
        ${this._showSuggestions && suggestions.length > 0 ? html`
          <div class="suggestions">
            ${suggestions.map((s, i) => html`
              <div
                class="suggestion ${i === this._highlightedIdx ? 'highlighted' : ''}"
                @mousedown=${(e: Event) => { e.preventDefault(); this._addTag(s); }}
              >${s}</div>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }
}
