import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { filteredPinned, filteredHistory, activeIndex } from '../store/clipboard-store';
import './pinned-item';

@customElement('pinned-list')
export class PinnedList extends LitElement {
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
      padding: 0 10px 8px;
      flex-shrink: 0;
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
    const items = filteredPinned.get();
    const historyCount = filteredHistory.get().length;
    const idx = activeIndex.get();
    return html`
      <div class="header">Pinned Items</div>
      <div class="list">
        ${items.length === 0
          ? html`<div class="empty">No pins yet — click Pin on a history item</div>`
          : items.map(
              (entry, i) => html`<pinned-item
                .entry=${entry}
                .active=${idx === historyCount + i}
                data-active=${idx === historyCount + i ? 'true' : 'false'}
              ></pinned-item>`,
            )}
      </div>
    `;
  }
}
