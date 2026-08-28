import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { isNewActionPickerOpen, newActionKind } from '../store/actions-store';

@customElement('new-action-dialog')
export class NewActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    .kind-row {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: 6px; cursor: pointer; margin-bottom: 6px;
      border: 1px solid var(--border-input-strong);
    }
    .kind-row:hover { background: var(--bg-hover); }
    .kind-icon { font-size: 16px; }
    .kind-label { font-size: 13px; color: var(--text-primary); }
    .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
      background: transparent; color: var(--text-secondary);
    }
    button:hover { background: var(--bg-hover); }
  `;

  private _pick(kind: 'terminal' | 'url' | 'form' | 'text' | 'app'): void {
    isNewActionPickerOpen.set(false);
    newActionKind.set(kind);
  }

  render() {
    if (!isNewActionPickerOpen.get()) return html``;
    return html`
      <div
        class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) isNewActionPickerOpen.set(false); delete el.dataset['dismissDown']; }}
      >
        <div
          class="dialog"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') isNewActionPickerOpen.set(false); }}
        >
          <h3>New Action</h3>
          <div class="kind-row" tabindex="0" @click=${() => this._pick('terminal')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('terminal'); }}>
            <span class="kind-icon">⚡️</span><span class="kind-label">Terminal — run a command</span>
          </div>
          <div class="kind-row" tabindex="0" @click=${() => this._pick('url')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('url'); }}>
            <span class="kind-icon">🔗</span><span class="kind-label">URL — open a link</span>
          </div>
          <div class="kind-row" tabindex="0" @click=${() => this._pick('form')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('form'); }}>
            <span class="kind-icon">🔐</span><span class="kind-label">Form — open a URL and auto-fill</span>
          </div>
          <div class="kind-row" tabindex="0" @click=${() => this._pick('text')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('text'); }}>
            <span class="kind-icon">📝</span><span class="kind-label">Text — type reusable text</span>
          </div>
          <div class="kind-row" tabindex="0" @click=${() => this._pick('app')} @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._pick('app'); }}>
            <span class="kind-icon">🚀</span><span class="kind-label">App — launch an application</span>
          </div>
          <div class="actions">
            <button @click=${() => isNewActionPickerOpen.set(false)}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
}
