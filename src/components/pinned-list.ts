import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { filteredPinned, filteredHistory, activeIndex, exportSelectedPins, importPins, allTags, tagFilter, setTagFilter, setNewPinOpen } from '../store/clipboard-store';
import './pinned-item';

@customElement('pinned-list')
export class PinnedList extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private exportMode = false;
  @state() private selectedIds = new Set<string>();

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

  private get allIds() {
    return filteredPinned.get().map((p) => p.id);
  }

  private get allSelected() {
    const ids = this.allIds;
    return ids.length > 0 && ids.every((id) => this.selectedIds.has(id));
  }

  private toggleSelectAll() {
    if (this.allSelected) {
      this.selectedIds = new Set();
    } else {
      this.selectedIds = new Set(this.allIds);
    }
  }

  private toggleItem(id: string) {
    const next = new Set(this.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds = next;
  }

  private enterExportMode() {
    this.exportMode = true;
    this.selectedIds = new Set();
  }

  private cancelExportMode() {
    this.exportMode = false;
    this.selectedIds = new Set();
  }

  private async doExport() {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;
    const ok = await exportSelectedPins(ids);
    if (ok) {
      this.exportMode = false;
      this.selectedIds = new Set();
    }
  }

  private async doImport() {
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

    return html`
      <div class="header-row">
        <span class="header">Pinned Items</span>
        ${this.exportMode
          ? html`
              <button class="btn btn-ghost" @click=${this.cancelExportMode}>Cancel</button>
              <button
                class="btn btn-primary"
                ?disabled=${this.selectedIds.size === 0}
                @click=${this.doExport}
              >Export ${this.selectedIds.size > 0 ? `(${this.selectedIds.size})` : ''}</button>
            `
          : html`
              <button class="btn-import" @click=${this.doImport}>Import</button>
              <button class="btn btn-ghost" @click=${this.enterExportMode}>Export</button>
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

      ${this.exportMode && items.length > 0 ? html`
        <div class="select-all-row">
          <input
            type="checkbox"
            id="select-all"
            .checked=${this.allSelected}
            @change=${this.toggleSelectAll}
          />
          <label for="select-all">Select all</label>
        </div>
      ` : ''}

      <div class="list">
        ${items.length === 0
          ? html`<div class="empty">No pins yet — click Pin on a history item</div>`
          : items.map((entry, i) => {
              if (this.exportMode) {
                return html`
                  <div class="item-row">
                    <input
                      type="checkbox"
                      .checked=${this.selectedIds.has(entry.id)}
                      @change=${() => this.toggleItem(entry.id)}
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
