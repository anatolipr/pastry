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

  private _wasOpen = false;

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
    .field { margin-bottom: 14px; position: relative; }
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
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: var(--bg-dialog); border: 1px solid var(--border-input-strong);
      border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      z-index: 200; overflow: hidden; max-height: 160px; overflow-y: auto;
    }
    .suggestion { padding: 6px 12px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
    .suggestion:hover { background: var(--bg-active-pinned); color: var(--text-primary); }
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

  private _suggestionsFor(name: string): string[] {
    const q = (this._values[name] ?? '').trim().toLowerCase();
    const history = placeholderHistory.get()[name] ?? [];
    if (!q) return history;
    return history.filter((v) => fuzzyMatch(v.toLowerCase(), q));
  }

  render() {
    if (!isPlaceholderDialogOpen.get()) return html``;
    const request = placeholderFillTarget.get();
    if (!request) return html``;
    const names = extractPlaceholders(request.text);

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}
        @keydown=${this._onKeyDown}>
        <div class="dialog">
          <h3>Fill in placeholders</h3>
          <p class="subtitle">Enter a value for each placeholder, then confirm.</p>
          ${names.map((name, i) => {
            const suggestions = this._openSuggestionsFor === name ? this._suggestionsFor(name) : [];
            return html`
              <div class="field">
                <label for="ph-${i}">${name}</label>
                <input
                  id="ph-${i}"
                  type="text"
                  autocomplete="off"
                  .value=${this._values[name] ?? ''}
                  placeholder=${name}
                  @focus=${() => { this._openSuggestionsFor = name; }}
                  @input=${(e: Event) => {
                    this._values = { ...this._values, [name]: (e.target as HTMLInputElement).value };
                    this._openSuggestionsFor = name;
                  }}
                  @blur=${() => setTimeout(() => { this._openSuggestionsFor = null; }, 150)}
                  @keydown=${this._onKeyDown}
                />
                ${suggestions.length > 0 ? html`
                  <div class="suggestions">
                    ${suggestions.map((s) => html`
                      <div class="suggestion" @mousedown=${(e: Event) => {
                        e.preventDefault();
                        this._values = { ...this._values, [name]: s };
                        this._openSuggestionsFor = null;
                      }}>${s}</div>`)}
                  </div>` : ''}
              </div>
            `;
          })}
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Confirm</button>
          </div>
        </div>
      </div>
    `;
  }
}
