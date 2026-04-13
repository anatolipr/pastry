import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  filteredPinned, filteredHistory, activeIndex,
  isExportMode, selectedPinExportIds, selectedHistoryExportIds,
  enterExportMode, cancelExportMode,
  togglePinExportItem, togglePinExportAll,
  exportCombined, copySelectedCombined,
  importPins, allTags, tagFilter, setTagFilter, setNewPinOpen,
} from '../store/clipboard-store';
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
    .header-row {
      display: flex;
      align-items: center;
      padding: 0 10px 8px;
      gap: 6px;
    }
    .header {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      flex: 1;
    }
    .btn {
      font-size: 11px;
      font-weight: 600;
      border: none;
      border-radius: 5px;
      padding: 3px 8px;
      cursor: pointer;
      line-height: 1.4;
      transition: opacity 0.1s;
    }
    .btn:hover { opacity: 0.8; }
    .btn-ghost {
      background: transparent;
      color: var(--text-muted);
    }
    .btn-ghost:hover { color: var(--text-primary); opacity: 1; }
    .btn-primary {
      background: var(--accent-history);
      color: var(--save-btn-color);
    }
    .btn-primary:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .btn-copy {
      background: var(--accent-pinned-bg, rgba(139,92,246,0.15));
      color: var(--accent-pinned);
    }
    .btn-copy:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .btn-import {
      background: transparent;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      border: none;
      border-radius: 5px;
      padding: 3px 8px;
      cursor: pointer;
      line-height: 1.4;
    }
    .btn-import:hover { color: var(--text-primary); }
    .btn-new {
      background: transparent;
      color: var(--accent-pinned);
      font-size: 16px;
      font-weight: 400;
      border: none;
      border-radius: 5px;
      padding: 2px 6px;
      cursor: pointer;
      line-height: 1;
    }
    .btn-new:hover { opacity: 0.7; }
    .select-all-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px 6px;
      font-size: 12px;
      color: var(--text-secondary);
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
    .item-row pinned-item {
      flex: 1;
      min-width: 0;
    }
    .tag-filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      padding: 0 10px 8px;
    }
    .tag-filter-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-hint);
      margin-right: 2px;
    }
    .tag-chip {
      font-size: 11px;
      font-weight: 600;
      border-radius: 12px;
      padding: 2px 9px;
      cursor: pointer;
      border: 1px solid var(--accent-history);
      background: transparent;
      color: var(--text-muted);
      transition: background 0.1s, color 0.1s, border-color 0.1s;
      line-height: 1.4;
    }
    .tag-chip:hover {
      color: var(--accent-history);
    }
    .tag-chip.active {
      background: var(--accent-history-bg);
      color: var(--accent-history);
    }
  `;

  private get allPinIds() {
    return filteredPinned.get().map((p) => p.id);
  }

  private get allPinsSelected() {
    const ids = this.allPinIds;
    return ids.length > 0 && ids.every((id) => selectedPinExportIds.get().has(id));
  }

  private _toggleSelectAll() {
    togglePinExportAll(!this.allPinsSelected);
  }

  private _toggleItem(id: string) {
    togglePinExportItem(id);
  }

  private async _doExport() {
    const ok = await exportCombined();
    if (ok) cancelExportMode();
  }

  private _doCopy() {
    copySelectedCombined();
    cancelExportMode();
  }

  private async _doImport() {
    await importPins();
  }

  private toggleTagFilter(tag: string) {
    const current = tagFilter.get();
    if (current.includes(tag)) {
      setTagFilter(current.filter((t) => t !== tag));
    } else {
      setTagFilter([...current, tag]);
    }
  }

  render() {
    const items = filteredPinned.get();
    const historyCount = filteredHistory.get().length;
    const idx = activeIndex.get();
    const tags = allTags.get();
    const activeTags = tagFilter.get();

    const exportMode = isExportMode.get();
    const pinSelected = selectedPinExportIds.get();
    const histSelected = selectedHistoryExportIds.get();
    const totalSelected = pinSelected.size + histSelected.size;

    return html`
      <div class="header-row">
        <span class="header">Pinned Items</span>
        ${exportMode
          ? html`
              <button class="btn btn-ghost" @click=${() => cancelExportMode()}>Cancel</button>
              <button class="btn btn-copy"
                ?disabled=${totalSelected === 0}
                @click=${this._doCopy}
              >Copy ${totalSelected > 0 ? `(${totalSelected})` : ''}</button>
              <button class="btn btn-primary"
                ?disabled=${totalSelected === 0}
                @click=${this._doExport}
              >Export ${totalSelected > 0 ? `(${totalSelected})` : ''}</button>
            `
          : html`
              <button class="btn-import" @click=${this._doImport}>Import</button>
              <button class="btn btn-ghost" @click=${() => enterExportMode()}>Export</button>
              <button class="btn-new" title="New pin" @click=${() => setNewPinOpen(true)}>+</button>
            `}
      </div>

      ${tags.length > 0 ? html`
        <div class="tag-filter-row">
          <span class="tag-filter-label">Tags</span>
          ${tags.map((tag) => html`
            <button
              class="tag-chip ${activeTags.includes(tag) ? 'active' : ''}"
              @click=${() => this.toggleTagFilter(tag)}
            >${tag}</button>
          `)}
        </div>
      ` : ''}

      ${exportMode && items.length > 0 ? html`
        <div class="select-all-row">
          <input
            type="checkbox"
            id="select-all-pins"
            .checked=${this.allPinsSelected}
            @change=${this._toggleSelectAll}
          />
          <label for="select-all-pins">Select all</label>
        </div>
      ` : ''}

      <div class="list">
        ${items.length === 0
          ? html`<div class="empty">No pins yet — click Pin on a history item</div>`
          : items.map((entry, i) => {
              if (exportMode) {
                return html`
                  <div class="item-row">
                    <input
                      type="checkbox"
                      .checked=${pinSelected.has(entry.id)}
                      @change=${() => this._toggleItem(entry.id)}
                    />
                    <pinned-item
                      .entry=${entry}
                      .active=${false}
                      data-active="false"
                    ></pinned-item>
                  </div>
                `;
              }
              return html`<pinned-item
                .entry=${entry}
                .active=${idx === historyCount + i}
                data-active=${idx === historyCount + i ? 'true' : 'false'}
              ></pinned-item>`;
            })}
      </div>
    `;
  }
}
