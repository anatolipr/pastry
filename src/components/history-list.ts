import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredHistory,
  clearHistory,
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
      flex: 1;
    }
    .header {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #888;
      padding: 0 10px 6px;
      flex-shrink: 0;
    }
    .controls-row {
      display: flex;
      align-items: center;
      padding: 0 10px 10px;
      flex-shrink: 0;
    }
    .clear-btn {
      margin-left: auto;
      background: transparent;
      border: 1px solid rgba(224,90,90,0.35);
      border-radius: 4px;
      color: #e05a5a;
      cursor: pointer;
      font-size: 10px;
      padding: 3px 7px;
      transition: background 0.1s;
      white-space: nowrap;
    }
    .clear-btn:hover {
      background: rgba(224,90,90,0.15);
    }
    .list {
      flex: 1;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .empty {
      font-size: 12px;
      color: #888;
      padding: 16px 10px;
      text-align: center;
    }
  `;

  render() {
    const items = filteredHistory.get();
    const idx = activeIndex.get();
    return html`
      <div class="header">Clipboard History</div>
      <div class="controls-row">
        <button class="clear-btn" @click=${() => clearHistory()}>Clear history</button>
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

