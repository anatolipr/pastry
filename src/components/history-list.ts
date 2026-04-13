import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredHistory,
  clearHistory,
  activeIndex,
  isExportMode,
  selectedHistoryExportIds,
  toggleHistoryExportItem,
  toggleHistoryExportAll,
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
      color: var(--text-muted);
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
      border: 1px solid var(--accent-danger);
      border-radius: 4px;
      color: var(--accent-danger);
      cursor: pointer;
      font-size: 10px;
      padding: 3px 7px;
      transition: background 0.1s;
      white-space: nowrap;
    }
    .clear-btn:hover {
      background: var(--bg-active-history);
    }
    .select-all-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px 6px;
      font-size: 12px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .select-all-row input[type="checkbox"] {
      accent-color: var(--accent-history);
      width: 14px;
      height: 14px;
      cursor: pointer;
    }
    .select-all-row label {
      cursor: pointer;
      user-select: none;
    }
    .item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-left: 10px;
    }
    .item-row input[type="checkbox"] {
      accent-color: var(--accent-history);
      width: 14px;
      height: 14px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .item-row clipboard-item {
      flex: 1;
      min-width: 0;
    }
    .list {
      flex: 1;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--divider) transparent;
    }
    .empty {
      font-size: 12px;
      color: var(--text-muted);
      padding: 16px 10px;
      text-align: center;
    }
  `;

  render() {
    const items = filteredHistory.get();
    const idx = activeIndex.get();
    const exportMode = isExportMode.get();
    const histSelected = selectedHistoryExportIds.get();
    const allHistSelected = items.length > 0 && items.every((e) => histSelected.has(e.id));

    return html`
      <div class="header">Clipboard History</div>
      <div class="controls-row">
        ${!exportMode
          ? html`<button class="clear-btn" @click=${() => clearHistory()}>Clear history</button>`
          : ''}
      </div>
      ${exportMode && items.length > 0 ? html`
        <div class="select-all-row">
          <input
            type="checkbox"
            id="select-all-history"
            .checked=${allHistSelected}
            @change=${() => toggleHistoryExportAll(!allHistSelected)}
          />
          <label for="select-all-history">Select all</label>
        </div>
      ` : ''}
      <div class="list">
        ${items.length === 0
          ? html`<div class="empty">Nothing copied yet</div>`
          : items.map(
              (entry, i) => exportMode
                ? html`
                    <div class="item-row">
                      <input
                        type="checkbox"
                        .checked=${histSelected.has(entry.id)}
                        @change=${() => toggleHistoryExportItem(entry.id)}
                      />
                      <clipboard-item
                        .entry=${entry}
                        .active=${false}
                        data-active="false"
                      ></clipboard-item>
                    </div>`
                : html`<clipboard-item
                    .entry=${entry}
                    .active=${idx === i}
                    data-active=${idx === i ? 'true' : 'false'}
                  ></clipboard-item>`,
            )}
      </div>
    `;
  }
}

