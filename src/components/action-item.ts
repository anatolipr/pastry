import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ActionEntry } from '../shared-types';

const KIND_ICON: Record<ActionEntry['kind'], string> = {
  terminal: '⚡️',
  url: '🔗',
  form: '🔐',
  text: '📝',
};

@customElement('action-item')
export class ActionItem extends LitElement {
  @property({ attribute: false }) entry!: ActionEntry;
  @property({ type: Boolean }) active = false;

  static styles = css`
    :host { display: block; }
    .row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; cursor: pointer; border-radius: 6px;
      font-size: 13px; color: var(--text-primary);
    }
    .row.active { background: var(--bg-active-history); }
    .row:hover { background: var(--bg-hover); }
    .icon { font-size: 14px; flex-shrink: 0; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tags { display: flex; gap: 4px; flex-shrink: 0; overflow: hidden; }
    .tag {
      font-size: 10px; color: var(--accent-history); background: var(--accent-history-bg);
      border: 1px solid var(--accent-history); border-radius: 8px; padding: 1px 6px;
      white-space: nowrap;
    }
    .kind { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .edit-btn, .duplicate-btn, .delete-btn {
      flex-shrink: 0; background: transparent; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 12px; padding: 2px 4px; border-radius: 4px;
      opacity: 0; transition: opacity 0.1s, color 0.1s, background 0.1s;
    }
    .row:hover .edit-btn, .row.active .edit-btn,
    .row:hover .duplicate-btn, .row.active .duplicate-btn,
    .row:hover .delete-btn, .row.active .delete-btn { opacity: 1; }
    .edit-btn:hover, .duplicate-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
    .delete-btn:hover { color: var(--accent-danger); background: var(--bg-hover); }
  `;

  private _onEditClick(e: Event): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('edit-action', { bubbles: true, composed: true }));
  }

  private _onDuplicateClick(e: Event): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('duplicate-action', { bubbles: true, composed: true }));
  }

  private _onDeleteClick(e: Event): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('delete-action', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="row ${this.active ? 'active' : ''}" data-active=${this.active}>
        <span class="icon">${KIND_ICON[this.entry.kind]}</span>
        <span class="name">${this.entry.name}</span>
        ${this.entry.tags?.length ? html`
          <span class="tags">
            ${this.entry.tags.map((t) => html`<span class="tag">${t}</span>`)}
          </span>
        ` : ''}
        <span class="kind">${this.entry.kind}</span>
        <button class="edit-btn" title="Edit" @click=${(e: Event) => this._onEditClick(e)}>✏️</button>
        <button class="duplicate-btn" title="Duplicate" @click=${(e: Event) => this._onDuplicateClick(e)}>⧉</button>
        <button class="delete-btn" title="Delete" @click=${(e: Event) => this._onDeleteClick(e)}>🗑️</button>
      </div>
    `;
  }
}
