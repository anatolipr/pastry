import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import * as chrono from 'chrono-node';
import {
  reminderTarget,
  reminderCallbackTarget,
  isReminderDialogOpen,
  closeReminderDialog,
  setReminderOnPin,
  clearReminderOnPin,
} from '../store/clipboard-store';

/** Format a Date as the value used by <input type="datetime-local">: "YYYY-MM-DDTHH:mm" */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Format a Date for display in the preview label. */
function formatPreview(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

@customElement('reminder-dialog')
export class ReminderDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _datetimeValue = '';
  @state() private _nlInput = '';
  @state() private _parsedDate: Date | null = null;
  @state() private _nlError = false;
  @state() private _seeded = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 360px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 16px; font-size: 14px; color: var(--accent-pinned); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; }
    input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-input); border: 1px solid var(--border-input-strong);
      border-radius: 5px; color: var(--text-primary); font-size: 13px;
      padding: 7px 10px; outline: none; margin-bottom: 14px; font-family: inherit;
    }
    input:focus { border-color: var(--accent-pinned); }
    input.error { border-color: var(--accent-danger); }
    .separator {
      display: flex; align-items: center; gap: 10px;
      color: var(--text-muted); font-size: 11px; margin-bottom: 14px;
    }
    .separator::before, .separator::after {
      content: ''; flex: 1; height: 1px; background: var(--border-subtle);
    }
    .preview {
      font-size: 11px; color: var(--accent-pinned); margin-bottom: 14px;
      padding: 5px 8px; background: var(--bg-active-pinned);
      border-radius: 4px; border: 1px solid var(--accent-pinned);
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .actions-left { margin-right: auto; }
    button {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong); transition: background 0.1s;
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .clear { background: transparent; color: var(--accent-danger); border-color: var(--accent-danger); }
    .clear:hover { background: var(--bg-active-history); }
    .confirm { background: var(--accent-pinned); color: #fff; border-color: var(--accent-pinned); font-weight: 600; }
    .confirm:hover:not(:disabled) { opacity: 0.85; }
    .confirm:disabled { opacity: 0.4; cursor: not-allowed; }
  `;

  private _seed(): void {
    const entry = reminderTarget.get();
    const cb = reminderCallbackTarget.get();
    const active = entry ?? cb;
    if (active && !this._seeded) {
      const initial = entry ? entry.reminderAt : cb!.initial;
      if (initial && initial > Date.now()) {
        const d = new Date(initial);
        this._datetimeValue = toDatetimeLocal(d);
        this._parsedDate = d;
      } else {
        this._datetimeValue = '';
        this._parsedDate = null;
      }
      this._nlInput = '';
      this._nlError = false;
      this._seeded = true;
    }
    if (!active) this._seeded = false;
  }

  private _onDatetimeChange(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this._datetimeValue = val;
    this._nlInput = '';
    this._nlError = false;
    this._parsedDate = val ? new Date(val) : null;
  }

  private _onNlInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this._nlInput = val;
    if (!val.trim()) {
      this._parsedDate = null;
      this._nlError = false;
      this._datetimeValue = '';
      return;
    }
    const parsed = chrono.parseDate(val, new Date(), { forwardDate: true });
    if (parsed) {
      this._parsedDate = parsed;
      this._datetimeValue = toDatetimeLocal(parsed);
      this._nlError = false;
    } else {
      this._parsedDate = null;
      this._nlError = true;
    }
  }

  private _handleConfirm(): void {
    if (!this._parsedDate) return;
    const entry = reminderTarget.get();
    const cb = reminderCallbackTarget.get();
    if (entry) {
      setReminderOnPin(entry.id, this._parsedDate.getTime());
    } else if (cb) {
      cb.callback(this._parsedDate.getTime());
    }
    this._reset();
    closeReminderDialog();
  }

  private _handleClear(): void {
    const entry = reminderTarget.get();
    const cb = reminderCallbackTarget.get();
    if (entry) {
      clearReminderOnPin(entry.id);
    } else if (cb) {
      cb.callback(null);
    }
    this._reset();
    closeReminderDialog();
  }

  private _handleCancel(): void {
    this._reset();
    closeReminderDialog();
  }

  private _reset(): void {
    this._datetimeValue = '';
    this._nlInput = '';
    this._parsedDate = null;
    this._nlError = false;
    this._seeded = false;
  }

  render() {
    if (!isReminderDialogOpen.get()) return html``;
    this._seed();
    const entry = reminderTarget.get();
    const cb = reminderCallbackTarget.get();
    const label = entry?.name ?? cb?.label ?? '';
    const hasExistingReminder = entry
      ? Boolean(entry.reminderAt && entry.reminderAt > Date.now())
      : Boolean(cb?.initial && cb.initial > Date.now());
    const canSave = this._parsedDate !== null && this._parsedDate.getTime() > Date.now();

    return html`
      <div class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}>
        <div class="dialog">
          <h3>Set Reminder — ${label}</h3>

          <label>Date &amp; time</label>
          <input
            type="datetime-local"
            .value=${this._datetimeValue}
            @change=${this._onDatetimeChange}
            @input=${this._onDatetimeChange}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._handleCancel(); }}
          />

          <div class="separator">or</div>

          <label>Natural language</label>
          <input
            type="text"
            class=${this._nlError ? 'error' : ''}
            .value=${this._nlInput}
            placeholder="20 minutes from now, tomorrow at 9am…"
            @input=${this._onNlInput}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._handleConfirm(); if (e.key === 'Escape') this._handleCancel(); }}
          />

          ${this._parsedDate && !this._nlError ? html`
            <div class="preview">Will remind: ${formatPreview(this._parsedDate)}</div>
          ` : ''}

          <div class="actions">
            ${hasExistingReminder ? html`
              <button class="clear actions-left" @click=${this._handleClear}>Remove</button>
            ` : ''}
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="confirm" ?disabled=${!canSave} @click=${this._handleConfirm}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
