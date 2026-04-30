import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isPlaceholderDialogOpen,
  placeholderPasteTarget,
  closePlaceholderPaste,
  extractPlaceholders,
  applyPlaceholders,
} from '../store/clipboard-store';

@customElement('placeholder-dialog')
export class PlaceholderDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _values: Record<string, string> = {};

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
      // Reset values when dialog opens, then focus the first input.
      this._values = {};
      requestAnimationFrame(() => {
        this.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus();
      });
    }
    this._wasOpen = isOpen;
  }

  private _handleConfirm(): void {
    const payload = placeholderPasteTarget.get();
    if (!payload) return;
    const filled = applyPlaceholders(payload.text, this._values);
    window.pastryAPI.pasteItem({
      text: filled,
      imageDataUrl: payload.imageDataUrl,
      htmlContent: payload.htmlContent
        ? applyPlaceholders(payload.htmlContent, this._values)
        : undefined,
    });
    closePlaceholderPaste();
    this._values = {};
  }

  private _handleCancel(): void {
    closePlaceholderPaste();
    this._values = {};
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.stopPropagation(); this._handleConfirm(); }
    if (e.key === 'Escape') { e.stopPropagation(); this._handleCancel(); }
  }

  render() {
    if (!isPlaceholderDialogOpen.get()) return html``;
    const payload = placeholderPasteTarget.get();
    if (!payload) return html``;
    const names = extractPlaceholders(payload.text);

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}
        @keydown=${this._onKeyDown}>
        <div class="dialog">
          <h3>Fill in placeholders</h3>
          <p class="subtitle">Enter a value for each placeholder, then click Paste.</p>
          ${names.map((name, i) => html`
            <div class="field">
              <label for="ph-${i}">${name}</label>
              <input
                id="ph-${i}"
                type="text"
                .value=${this._values[name] ?? ''}
                placeholder=${name}
                @input=${(e: Event) => {
                  this._values = { ...this._values, [name]: (e.target as HTMLInputElement).value };
                }}
                @keydown=${this._onKeyDown}
              />
            </div>
          `)}
          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Paste</button>
          </div>
        </div>
      </div>
    `;
  }
}
