import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  isPasteGroupDialogOpen, closePasteGroupDialog, pinPasteGroup,
  selectedHistoryExportIds, selectedPinExportIds,
  filteredHistory, filteredPinned,
  type PasteGroupDelimiter,
} from '../store/clipboard-store';

@customElement('paste-group-dialog')
export class PasteGroupDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _delimiter: PasteGroupDelimiter = '[TAB]';

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
    h3 { margin: 0 0 4px; font-size: 14px; color: var(--accent-pinned); }
    .subtitle {
      font-size: 11px; color: var(--text-muted); margin: 0 0 16px;
    }
    label {
      display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;
    }
    input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 16px; font-family: inherit;
    }
    input:focus { border-color: var(--accent-pinned); }
    .delimiter-label {
      display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;
    }
    .delimiter-row {
      display: flex; gap: 8px; margin-bottom: 20px;
    }
    .delim-btn {
      flex: 1; padding: 7px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
      cursor: pointer; border: 1px solid var(--border-input-strong);
      background: var(--bg-input); color: var(--text-secondary);
      font-family: monospace; transition: background 0.1s, color 0.1s, border-color 0.1s;
    }
    .delim-btn:hover { color: var(--text-primary); }
    .delim-btn.active {
      background: var(--bg-active-pinned); border-color: var(--accent-pinned);
      color: var(--accent-pinned);
    }
    .preview {
      font-size: 11px; color: var(--text-muted); background: var(--bg-input);
      border-radius: 5px; padding: 7px 10px; margin-bottom: 16px;
      font-family: monospace; white-space: pre-wrap; word-break: break-all;
      max-height: 60px; overflow: hidden; text-overflow: ellipsis;
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
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
    const isOpen = isPasteGroupDialogOpen.get();
    if (isOpen) {
      this.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus();
    } else {
      this._name = '';
      this._delimiter = '[TAB]';
    }
  }

  private _buildPreview(): string {
    const histIds = selectedHistoryExportIds.get();
    const pinIds = selectedPinExportIds.get();
    const histItems = filteredHistory.get().filter((e) => histIds.has(e.id));
    const pinItems = filteredPinned.get().filter((p) => pinIds.has(p.id));
    const texts = [...histItems, ...pinItems].map((e) => e.text.slice(0, 20)).filter(Boolean);
    return texts.join(this._delimiter);
  }

  private _handleConfirm(): void {
    pinPasteGroup(this._delimiter, this._name);
    this._name = '';
    this._delimiter = '[TAB]';
  }

  private _handleCancel(): void {
    closePasteGroupDialog();
    this._name = '';
    this._delimiter = '[TAB]';
  }

  render() {
    if (!isPasteGroupDialogOpen.get()) return html``;

    const histCount = selectedHistoryExportIds.get().size;
    const pinCount = selectedPinExportIds.get().size;
    const total = histCount + pinCount;
    const preview = this._buildPreview();

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>Pin Paste Group</h3>
          <p class="subtitle">${total} item${total !== 1 ? 's' : ''} · joined and pinned for quick re-use</p>

          <span class="delimiter-label">Join items with</span>
          <div class="delimiter-row">
            <button
              class="delim-btn ${this._delimiter === '[TAB]' ? 'active' : ''}"
              @click=${() => { this._delimiter = '[TAB]'; }}
            >[TAB]</button>
            <button
              class="delim-btn ${this._delimiter === '[ENTER]' ? 'active' : ''}"
              @click=${() => { this._delimiter = '[ENTER]'; }}
            >[ENTER]</button>
          </div>

          <div class="preview">${preview}</div>

          <label for="paste-group-name">Label (optional)</label>
          <input
            id="paste-group-name"
            type="text"
            .value=${this._name}
            placeholder="e.g. username + password"
            @input=${(e: Event) => { this._name = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') this._handleConfirm();
              if (e.key === 'Escape') this._handleCancel();
            }}
          />

          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" @click=${this._handleConfirm}>Pin Group</button>
          </div>
        </div>
      </div>
    `;
  }
}
