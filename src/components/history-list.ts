import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredHistory,
  historySize,
  setHistorySize,
  activeIndex,
} from '../store/clipboard-store';
import './clipboard-item';

@customElement('history-list')
export class HistoryList extends LitElement {
  private watcher = new SignalWatcher(this);

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .header {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #666;
      padding: 0 10px 6px;
      flex-shrink: 0;
    }
    .settings-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px 10px;
      flex-shrink: 0;
    }
    .settings-label {
      font-size: 11px;
      color: #555;
      white-space: nowrap;
    }
    .settings-row input[type="number"] {
      width: 52px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 5px;
      color: #ddd;
      font-size: 12px;
      padding: 3px 6px;
      outline: none;
      -moz-appearance: textfield;
    }
    .settings-row input[type="number"]::-webkit-outer-spin-button,
    .settings-row input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
    }
    .settings-row input[type="number"]:focus {
      border-color: rgba(255,255,255,0.3);
    }
    .list {
      flex: 1;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .empty {
      font-size: 12px;
      color: #555;
      padding: 16px 10px;
      text-align: center;
    }
  `;

  private _onSizeChange(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) setHistorySize(val);
  }

  render() {
    const items = filteredHistory.get();
    const idx = activeIndex.get();
    return html`
      <div class="header">Clipboard History</div>
      <div class="settings-row">
        <span class="settings-label">History size:</span>
        <input
          type="number"
          min="1"
          max="200"
          .value=${String(historySize.get())}
          @change=${this._onSizeChange}
        />
      </div>
      <div class="list">
        ${items.length === 0
          ? html`<div class="empty">Nothing copied yet</div>`
          : items.map(
              (entry, i) => html`<clipboard-item
                .entry=${entry}
                .active=${idx === i}
                data-active=${idx === i ? 'true' : 'false'}
              ></clipboard-item>`,
            )}
      </div>
    `;
  }
}

