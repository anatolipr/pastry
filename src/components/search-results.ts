import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { combinedItems, activeIndex } from '../store/clipboard-store';
import type { PinnedEntry } from '../shared-types';
import './clipboard-item';
import './pinned-item';

@customElement('search-results')
export class SearchResults extends LitElement {
  private watcher = new SignalWatcher(this);

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex: 1;
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
      padding: 24px 10px;
      text-align: center;
    }
    .badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: rgba(240,168,64,0.18);
      color: #f0a840;
      border: 1px solid rgba(240,168,64,0.3);
      border-radius: 3px;
      padding: 1px 5px;
      margin-left: 6px;
      vertical-align: middle;
      position: relative;
      top: -1px;
    }
    .item-wrapper {
      position: relative;
    }
  `;

  render() {
    const items = combinedItems.get();
    const idx = activeIndex.get();

    if (items.length === 0) {
      return html`<div class="list"><div class="empty">No results</div></div>`;
    }

    return html`
      <div class="list">
        ${items.map((item, i) => {
          const isActive = idx === i;
          if (item.kind === 'history') {
            return html`<clipboard-item
              .entry=${item.entry}
              .active=${isActive}
              data-active=${isActive}
            ></clipboard-item>`;
          } else {
            return html`<div class="item-wrapper">
              <pinned-item
                .entry=${item.entry as PinnedEntry}
                .active=${isActive}
                data-active=${isActive}
              ></pinned-item>
            </div>`;
          }
        })}
      </div>
    `;
  }
}
