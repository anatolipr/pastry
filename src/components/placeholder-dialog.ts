import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isPlaceholderDialogOpen,
  placeholderFillTarget,
  closePlaceholderFill,
  extractPlaceholders,
  placeholderHistory,
  recordPlaceholderValue,
} from '../store/clipboard-store';

/** Returns true if every character of `query` appears in `text` in order (same
 * fuzzy-match semantics as the actions search — see actions-store.ts). */
function fuzzyMatch(text: string, query: string): boolean {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

@customElement('placeholder-dialog')
export class PlaceholderDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _values: Record<string, string> = {};
  @state() private _openSuggestionsFor: string | null = null;
  @state() private _highlightedIdx = -1;

  private _wasOpen = false;
  // Only one field's suggestions can be open at a time (see _openSuggestionsFor),
  // so a single shared anchor-name is safe — it's only ever assigned to the
  // currently-open field's input, never applied to all inputs uniformly (see
  // making-dropdowns' "anchor-name scoping trap").
  private static readonly ANCHOR_NAME = '--placeholder-suggestions';

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
    h3 { margin: 0 0 4px; font-size: 14px; color: var(--accent-pinned); }
    .subtitle { font-size: 11px; color: var(--text-muted); margin: 0 0 16px; }
    .field { margin-bottom: 14px; }
    label {
      display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px;
      font-weight: 600;
    }
    input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; font-family: inherit;
    }
    input:focus { border-color: var(--accent-pinned); }
    .suggestions {
      position: fixed;
      margin: 0;
      inset: auto;
      top: anchor(bottom);
      left: anchor(left);
      width: anchor-size(width);
      position-try-fallbacks: flip-block;
      max-height: 160px;
      background: var(--bg-dialog); border: 1px solid var(--border-input-strong);
      border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      overflow-y: auto; overflow-x: hidden;
    }
    .suggestions:popover-open { margin-top: 4px; }
    .suggestion {
      padding: 6px 12px; font-size: 12px; color: var(--text-secondary); cursor: pointer;
      display: flex; align-items: center; gap: 6px;
    }
    .suggestion:hover, .suggestion.highlighted { background: var(--bg-active-pinned); color: var(--text-primary); }
    .suggestion .curated-mark { color: var(--accent-pinned); font-size: 11px; flex-shrink: 0; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    button.cancel {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
      background: transparent; color: var(--text-secondary);
    }
    button.cancel:hover { background: var(--bg-hover); }
    button.confirm {
      border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: 600;
      padding: 6px 14px; border: 1px solid var(--accent-pinned);
      background: var(--accent-pinned); color: #1a1a1e;
    }
    button.confirm:hover { opacity: 0.85; }
  `;

  updated() {
    const isOpen = isPlaceholderDialogOpen.get();
    if (isOpen && !this._wasOpen) {
      this._values = {};
      this._openSuggestionsFor = null;
      requestAnimationFrame(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus();
      });
    }
    this._wasOpen = isOpen;

    const menu = this.shadowRoot?.querySelector<HTMLElement>('.suggestions');
    const shouldShow = this._openSuggestionsFor !== null && this._suggestionsFor(this._openSuggestionsFor).length > 0;
    if (menu) {
      if (shouldShow && !menu.matches(':popover-open')) menu.showPopover();
      else if (!shouldShow && menu.matches(':popover-open')) menu.hidePopover();
    }
  }

  private _handleConfirm(): void {
    const request = placeholderFillTarget.get();
    if (!request) return;
    for (const [name, value] of Object.entries(this._values)) {
      recordPlaceholderValue(name, value);
    }
    const values = this._values;
    closePlaceholderFill();
    this._values = {};
    request.onConfirm(values);
  }

  private _handleCancel(): void {
    closePlaceholderFill();
    this._values = {};
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.stopPropagation(); this._handleConfirm(); }
    if (e.key === 'Escape') { e.stopPropagation(); this._handleCancel(); }
  }

  /** Curated options (from the action's own paramOptions, if any) come first, followed
   * by cross-action typed-value history — deduped so a value already offered as a
   * curated option isn't repeated from history. */
  private _suggestionsFor(name: string): string[] {
    const q = (this._values[name] ?? '').trim().toLowerCase();
    const request = placeholderFillTarget.get();
    const options = request?.options?.[name] ?? [];
    const history = (placeholderHistory.get()[name] ?? []).filter((v) => !options.includes(v));
    const combined = [...options, ...history];
    if (!q) return combined;
    return combined.filter((v) => fuzzyMatch(v.toLowerCase(), q));
  }

  private _isCuratedOption(name: string, value: string): boolean {
    return (placeholderFillTarget.get()?.options?.[name] ?? []).includes(value);
  }

  private _selectSuggestion(name: string, value: string): void {
    this._values = { ...this._values, [name]: value };
    this._openSuggestionsFor = null;
    this._highlightedIdx = -1;
  }

  private _onFieldKeyDown(e: KeyboardEvent, name: string): void {
    const suggestions = this._openSuggestionsFor === name ? this._suggestionsFor(name) : [];
    if (!suggestions.length) { this._onKeyDown(e); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      this._highlightedIdx = Math.min(this._highlightedIdx + 1, suggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      this._highlightedIdx = Math.max(this._highlightedIdx - 1, -1);
    } else if (e.key === 'Enter' && this._highlightedIdx >= 0) {
      e.preventDefault(); e.stopPropagation();
      this._selectSuggestion(name, suggestions[this._highlightedIdx]);
    } else if (e.key === 'Escape' && this._openSuggestionsFor === name) {
      e.stopPropagation();
      this._openSuggestionsFor = null;
      this._highlightedIdx = -1;
    } else {
      this._onKeyDown(e);
    }
  }

  render() {
    if (!isPlaceholderDialogOpen.get()) return html``;
    const request = placeholderFillTarget.get();
    if (!request) return html``;
    const names = extractPlaceholders(request.text);
    const openName = this._openSuggestionsFor;
    const suggestions = openName ? this._suggestionsFor(openName) : [];

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}
        @keydown=${this._onKeyDown}>
        <div class="dialog">
          <h3>Fill in placeholders</h3>
          <p class="subtitle">Enter a value for each placeholder, then confirm.</p>
          ${names.map((name, i) => html`
              <div class="field">
                <label for="ph-${i}">${name}</label>
                <input
                  id="ph-${i}"
                  type="text"
                  autocomplete="off"
                  .value=${this._values[name] ?? ''}
                  placeholder=${name}
                  style=${openName === name ? `anchor-name: ${PlaceholderDialog.ANCHOR_NAME}` : ''}
                  @focus=${() => { this._openSuggestionsFor = name; this._highlightedIdx = -1; }}
                  @input=${(e: Event) => {
                    this._values = { ...this._values, [name]: (e.target as HTMLInputElement).value };
                    this._openSuggestionsFor = name;
                    this._highlightedIdx = -1;
                  }}
                  @blur=${() => setTimeout(() => { this._openSuggestionsFor = null; this._highlightedIdx = -1; }, 150)}
                  @keydown=${(e: KeyboardEvent) => this._onFieldKeyDown(e, name)}
                />
              </div>
            `)}
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Confirm</button>
          </div>
        </div>
        <div class="suggestions" popover="manual" style=${`position-anchor: ${PlaceholderDialog.ANCHOR_NAME}`}>
          ${suggestions.map((s, i) => html`
            <div class="suggestion ${i === this._highlightedIdx ? 'highlighted' : ''}" @mousedown=${(e: Event) => {
              e.preventDefault();
              if (openName) this._selectSuggestion(openName, s);
            }}>${openName && this._isCuratedOption(openName, s) ? html`<span class="curated-mark">★</span>` : ''}${s}</div>`)}
        </div>
      </div>
    `;
  }
}
