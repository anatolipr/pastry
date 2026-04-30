import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import {
  historySize,
  shortcut,
  themeMode,
  setHistorySize,
  setShortcut,
  setThemeMode,
  isSettingsOpen,
  type ThemeMode,
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
  @state() private _showTroubleshoot = false;
  @state() private _showHelp = false;
  @state() private _theme: ThemeMode = 'auto';

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: var(--overlay-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog {
      background: var(--bg-dialog);
      border: 1px solid var(--border-dialog);
      border-radius: 10px;
      padding: 20px 24px;
      width: 340px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    h3 {
      margin: 0 0 18px;
      font-size: 14px;
      color: var(--text-primary);
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    input[type="number"] {
      width: 80px;
      box-sizing: border-box;
      background: var(--bg-input);
      border: 1px solid var(--border-input-strong);
      border-radius: 5px;
      color: var(--text-primary);
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
      border-color: var(--border-focus);
    }
    .shortcut-capture {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .shortcut-badge {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-input);
      border: 1px solid var(--border-input-strong);
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
      border: 1px solid var(--border-input-strong);
      background: transparent;
      color: var(--text-secondary);
      transition: background 0.1s, border-color 0.1s, color 0.1s;
      white-space: nowrap;
    }
    .capture-btn:hover {
      background: var(--bg-hover);
    }
    .capture-btn.listening {
      border-color: var(--border-focus);
      color: var(--accent-history);
      background: var(--accent-history-bg);
    }
    .error {
      font-size: 11px;
      color: var(--accent-danger);
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
      border: 1px solid var(--border-input-strong);
      transition: background 0.1s;
    }
    .cancel {
      background: transparent;
      color: var(--text-secondary);
    }
    .cancel:hover {
      background: var(--bg-hover);
    }
    .save {
      background: var(--save-btn-bg);
      color: var(--save-btn-color);
      border-color: var(--save-btn-bg);
      font-weight: 600;
    }
    .save:hover {
      background: var(--save-btn-hover);
    }
    .theme-pills {
      display: flex;
      gap: 6px;
    }
    .theme-pill {
      flex: 1;
      padding: 5px 0;
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      border-radius: 5px;
      border: 1px solid var(--border-input-strong);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
    }
    .theme-pill:hover {
      background: var(--bg-hover);
    }
    .theme-pill.active {
      background: var(--theme-pill-active-bg);
      border-color: var(--theme-pill-active-border);
      color: var(--text-primary);
      font-weight: 600;
    }
    .troubleshoot-section {
      margin-top: 20px;
      border-top: 1px solid var(--border-soft);
      padding-top: 16px;
    }
    .troubleshoot-btn {
      background: transparent;
      color: var(--text-secondary);
      font-size: 11px;
      padding: 4px 10px;
      border: 1px solid var(--border-soft);
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.1s, color 0.1s;
    }
    .troubleshoot-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .troubleshoot-content {
      margin-top: 12px;
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.6;
    }
    .troubleshoot-content p {
      margin: 0 0 8px;
    }
    .troubleshoot-content ol {
      margin: 0 0 10px;
      padding-left: 18px;
    }
    .troubleshoot-content li {
      margin-bottom: 4px;
    }
    .cmd-block {
      background: var(--cmd-block-bg);
      border: 1px solid var(--cmd-block-border);
      border-radius: 4px;
      padding: 7px 10px;
      font-family: monospace;
      font-size: 10px;
      color: var(--cmd-block-color);
      white-space: pre;
      margin: 6px 0 10px;
      user-select: all;
    }
    .made-by {
      margin-top: 16px;
      font-size: 11px;
      color: var(--made-by-color);
      text-align: center;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      margin-bottom: 18px;
    }
    .dialog-header h3 {
      margin: 0;
      flex: 1;
    }
    .help-btn {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--border-input-strong);
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      transition: background 0.1s, color 0.1s, border-color 0.1s;
      flex-shrink: 0;
    }
    .help-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-focus);
    }
    .help-content {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.6;
    }
    .help-section {
      margin-bottom: 14px;
    }
    .help-section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }
    .shortcut-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 5px;
    }
    .shortcut-key {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-input);
      border: 1px solid var(--border-input-strong);
      border-radius: 4px;
      padding: 1px 7px;
      white-space: nowrap;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .shortcut-desc {
      color: var(--text-secondary);
      font-size: 12px;
    }
    .feature-row {
      display: flex;
      gap: 8px;
      margin-bottom: 5px;
    }
    .feature-name {
      font-weight: 600;
      color: var(--text-primary);
      min-width: 90px;
      flex-shrink: 0;
    }
    .help-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
    }
    .help-dialog {
      width: 420px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }
    .help-dialog .help-content {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this._historySize = historySize.get();
    this._shortcut = shortcut.get();
    this._shortcutDisplay = formatAccelerator(shortcut.get());
    this._theme = themeMode.get();
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
    setThemeMode(this._theme);
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
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._handleCancel(); delete el.dataset['dismissDown']; }}
      >
        <div class="dialog">
          <div class="dialog-header">
            <h3>Settings</h3>
            <button class="help-btn" title="Help & Shortcuts" @click=${() => { this._showHelp = true; }}>?</button>
          </div>
          ${this._renderSettings()}
        </div>
      </div>
      ${this._showHelp ? html`
        <div
          class="overlay"
          style="z-index: 110"
          @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
          @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) { this._showHelp = false; } delete el.dataset['dismissDown']; }}
        >
          <div class="dialog help-dialog">
            <div class="dialog-header">
              <h3>Help &amp; Shortcuts</h3>
            </div>
            ${this._renderHelp()}
          </div>
        </div>
      ` : ''}
    `;
  }

  // ---------------------------------------------------------------------------
  // HELP LAST UPDATED: commit def0796 (add Edit button to clipboard history items) — 2026-04-30
  //
  // To check for features added since: git log --oneline def0796..HEAD
  // Review each commit for user-facing changes, then update _renderHelp() below.
  // After updating, replace the commit hash above with the current HEAD hash and
  // update the date. See AGENTS.md for full instructions.
  // ---------------------------------------------------------------------------
  private _renderHelp() {
    const globalShortcut = formatAccelerator(this._shortcut || shortcut.get());
    return html`
      <div class="help-content">
        <div class="help-section">
          <div class="help-section-title">Keyboard Shortcuts</div>
          <div class="shortcut-row"><span class="shortcut-key">${globalShortcut}</span><span class="shortcut-desc">Open / show Pastry (global, configurable)</span></div>
          <div class="shortcut-row"><span class="shortcut-key">↑ ↓</span><span class="shortcut-desc">Navigate items</span></div>
          <div class="shortcut-row"><span class="shortcut-key">← →</span><span class="shortcut-desc">Switch between History and Pins panel</span></div>
          <div class="shortcut-row"><span class="shortcut-key">Enter</span><span class="shortcut-desc">Paste selected item into last active app</span></div>
          <div class="shortcut-row"><span class="shortcut-key">⌘C</span><span class="shortcut-desc">Copy selected item to clipboard</span></div>
          <div class="shortcut-row"><span class="shortcut-key">⌘N</span><span class="shortcut-desc">Create a new pin from scratch</span></div>
          <div class="shortcut-row"><span class="shortcut-key">⌘E</span><span class="shortcut-desc">Edit the most recently added pin</span></div>
          <div class="shortcut-row"><span class="shortcut-key">Esc</span><span class="shortcut-desc">Close / hide the window</span></div>
        </div>
        <div class="help-section">
          <div class="help-section-title">Features</div>
          <div class="feature-row"><span class="feature-name">History</span><span class="shortcut-desc">Automatically captures everything you copy, up to the configured limit</span></div>
          <div class="feature-row"><span class="feature-name">Pins</span><span class="shortcut-desc">Save frequently used snippets, images, or rich text permanently; unpinning an item copies it to your clipboard</span></div>
          <div class="feature-row"><span class="feature-name">Search</span><span class="shortcut-desc">Type anything to instantly filter both history and pins</span></div>
          <div class="feature-row"><span class="feature-name">Tags</span><span class="shortcut-desc">Label pins with tags to organise and filter them</span></div>
          <div class="feature-row"><span class="feature-name">Reminders</span><span class="shortcut-desc">Set a time-based reminder on any pinned item</span></div>
          <div class="feature-row"><span class="feature-name">Images</span><span class="shortcut-desc">History and pins support images; click a thumbnail to open a full-size preview</span></div>
          <div class="feature-row"><span class="feature-name">Rich text</span><span class="shortcut-desc">HTML/rich formatting is preserved when pasting</span></div>
          <div class="feature-row"><span class="feature-name">Appearance</span><span class="shortcut-desc">Choose Dark, Light, or Auto (follows system) theme in Settings</span></div>
          <div class="feature-row"><span class="feature-name">Export</span><span class="shortcut-desc">Click Export in the Pins panel to enter export mode; select any mix of pins and history items, then save to a JSON file or copy all to clipboard</span></div>
          <div class="feature-row"><span class="feature-name">Import</span><span class="shortcut-desc">Click Import in the Pins panel to restore pins from a previously exported JSON file</span></div>
          <div class="feature-row"><span class="feature-name">Paste groups</span><span class="shortcut-desc">In a pin's content, use [TAB] or [ENTER] as separators to paste multiple fields in sequence — e.g. username[TAB]password pastes the username, presses Tab, then pastes the password</span></div>
          <div class="feature-row"><span class="feature-name">Edit history</span><span class="shortcut-desc">Click Edit on any clipboard history item to modify its text before pasting or pinning</span></div>
          <div class="feature-row"><span class="feature-name">Pin Group</span><span class="shortcut-desc">In export mode, select items then click "Pin Group" to join them with a [TAB] or [ENTER] delimiter into a new paste-group pin; the result is also copied to your clipboard for immediate use</span></div>
          <div class="feature-row"><span class="feature-name">Placeholders</span><span class="shortcut-desc">Add <code>::name::</code> tokens to any pin or history item; clicking Paste prompts you to fill in each value before pasting</span></div>
        </div>
      </div>
      <div class="help-actions">
        <button class="cancel" @click=${() => { this._showHelp = false; }}>Close</button>
      </div>
    `;
  }

  private _renderSettings() {
    return html`

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
            <label>Appearance</label>
            <div class="theme-pills">
              ${(['dark', 'light', 'auto'] as ThemeMode[]).map(mode => html`
                <button
                  class="theme-pill ${this._theme === mode ? 'active' : ''}"
                  @click=${() => { this._theme = mode; }}
                >${mode[0].toUpperCase() + mode.slice(1)}</button>
              `)}
            </div>
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

          <div class="troubleshoot-section">
            <button
              class="troubleshoot-btn"
              @click=${() => { this._showTroubleshoot = !this._showTroubleshoot; }}
            >
              ${this._showTroubleshoot ? 'Hide' : 'Troubleshoot Paste…'}
            </button>
            ${this._showTroubleshoot ? html`
              <div class="troubleshoot-content">
                <p>If Paste does nothing or focus doesn't switch, macOS permissions may need to be reset. Run these two commands in Terminal, then relaunch the app:</p>
                <div class="cmd-block">tccutil reset AppleEvents com.anatoli.pastry
tccutil reset Accessibility com.anatoli.pastry</div>
                <p>After relaunching, trigger the shortcut and click Paste. macOS will show two prompts:</p>
                <ol>
                  <li><strong>"pastry" wants access to control "System Events"</strong> — click <strong>Allow</strong></li>
                  <li><strong>Accessibility access required</strong> — open System Settings and enable Pastry under <strong>Privacy &amp; Security → Accessibility</strong></li>
                </ol>
              </div>
            ` : ''}
          </div>
          <div class="made-by">made by Anatoli Radulov</div>
    `;
  }
}
