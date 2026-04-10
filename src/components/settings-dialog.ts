import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  historySize,
  shortcut,
  setHistorySize,
  setShortcut,
  isSettingsOpen,
} from '../store/clipboard-store';

// ---------------------------------------------------------------------------
// Accelerator helpers
// ---------------------------------------------------------------------------

function buildAccelerator(e: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  // Require Cmd (Mac) or Ctrl to avoid single-key conflicts.
  if (!e.metaKey && !e.ctrlKey) return null;
  if (e.metaKey || e.ctrlKey) modifiers.push('CommandOrControl');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');

  const key = normalizeKey(e.key);
  if (!key) return null; // modifier-only keypress

  return [...modifiers, key].join('+');
}

function normalizeKey(key: string): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift', 'Super'].includes(key)) return null;
  if (key.length === 1) return key.toUpperCase();
  const special: Record<string, string> = {
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
    Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    Insert: 'Insert', Home: 'Home', End: 'End',
    PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    ' ': 'Space',
  };
  return special[key] ?? null;
}

function formatAccelerator(acc: string): string {
  return acc.split('+').map(part => {
    switch (part) {
      case 'CommandOrControl':
      case 'Command': return '⌘';
      case 'Ctrl': return '⌃';
      case 'Alt':
      case 'Option': return '⌥';
      case 'Shift': return '⇧';
      default: return part;
    }
  }).join('');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@customElement('settings-dialog')
export class SettingsDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _historySize = 50;
  @state() private _shortcut = '';
  @state() private _shortcutDisplay = '';
  @state() private _capturing = false;
  @state() private _error = '';

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog {
      background: #2a2a2e;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 20px 24px;
      width: 340px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 18px;
      font-size: 14px;
      color: #e0e0e0;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 12px;
      color: #aaa;
      margin-bottom: 6px;
    }
    input[type="number"] {
      width: 80px;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 5px;
      color: #e0e0e0;
      font-size: 13px;
      padding: 7px 10px;
      outline: none;
      -moz-appearance: textfield;
    }
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
    }
    input[type="number"]:focus {
      border-color: rgba(105, 180, 255, 0.5);
    }
    .shortcut-capture {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .shortcut-badge {
      font-size: 14px;
      font-weight: 600;
      color: #e0e0e0;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 5px;
      padding: 6px 12px;
      min-width: 70px;
      letter-spacing: 0.05em;
      text-align: center;
    }
    .capture-btn {
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      padding: 6px 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: transparent;
      color: #aaa;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
      white-space: nowrap;
    }
    .capture-btn:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .capture-btn.listening {
      border-color: rgba(105, 180, 255, 0.6);
      color: #69b4ff;
      background: rgba(105, 180, 255, 0.08);
    }
    .error {
      font-size: 11px;
      color: #e05a5a;
      margin-top: 8px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
    button {
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      padding: 6px 14px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      transition: background 0.1s;
    }
    .cancel {
      background: transparent;
      color: #aaa;
    }
    .cancel:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .save {
      background: #69b4ff;
      color: #1a1a22;
      border-color: #69b4ff;
      font-weight: 600;
    }
    .save:hover {
      background: #88c8ff;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this._historySize = historySize.get();
    this._shortcut = shortcut.get();
    this._shortcutDisplay = formatAccelerator(shortcut.get());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopCapture();
  }

  private _startCapture(): void {
    this._capturing = true;
    this._error = '';
    window.addEventListener('keydown', this._captureKeydown, { capture: true });
  }

  private _stopCapture(): void {
    this._capturing = false;
    window.removeEventListener('keydown', this._captureKeydown, { capture: true });
  }

  private _captureKeydown = (e: KeyboardEvent): void => {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (e.key === 'Escape') {
      this._stopCapture();
      return;
    }

    const acc = buildAccelerator(e);
    if (!acc) return; // modifier-only keypress — wait for the main key

    this._shortcut = acc;
    this._shortcutDisplay = formatAccelerator(acc);
    this._stopCapture();
  };

  private async _handleSave(): Promise<void> {
    this._error = '';

    // Apply shortcut change first (requires IPC to main process).
    if (this._shortcut !== shortcut.get()) {
      const ok = await window.pastryAPI.registerShortcut(this._shortcut);
      if (!ok) {
        this._error = 'Shortcut is already in use. Try a different combination.';
        return;
      }
      setShortcut(this._shortcut);
    }

    setHistorySize(this._historySize);
    isSettingsOpen.set(false);
  }

  private _handleCancel(): void {
    this._stopCapture();
    isSettingsOpen.set(false);
  }

  render() {
    return html`
      <div
        class="overlay"
        @click=${(e: MouseEvent) => { if (e.target === e.currentTarget) this._handleCancel(); }}
      >
        <div class="dialog">
          <h3>Settings</h3>

          <div class="field">
            <label>History size (1–200)</label>
            <input
              type="number"
              min="1"
              max="200"
              .value=${String(this._historySize)}
              @change=${(e: Event) => {
                const v = parseInt((e.target as HTMLInputElement).value, 10);
                if (!isNaN(v)) this._historySize = Math.max(1, Math.min(200, v));
              }}
            />
          </div>

          <div class="field">
            <label>Global shortcut</label>
            <div class="shortcut-capture">
              <span class="shortcut-badge">${this._shortcutDisplay}</span>
              <button
                class="capture-btn ${this._capturing ? 'listening' : ''}"
                @click=${() => this._capturing ? this._stopCapture() : this._startCapture()}
              >
                ${this._capturing ? 'Listening… (Esc to cancel)' : 'Change'}
              </button>
            </div>
            ${this._error ? html`<div class="error">${this._error}</div>` : ''}
          </div>

          <div class="actions">
            <button class="cancel" @click=${this._handleCancel}>Cancel</button>
            <button class="save" @click=${this._handleSave}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
