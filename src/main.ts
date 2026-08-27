import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, nativeImage, Tray } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { exec, execFile } from 'node:child_process';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { GLOBAL_SHORTCUT, ACTIONS_SHORTCUT, POLL_INTERVAL_MS } from './constants';
import type { FormStep } from './shared-types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const DEBUG = false;

let mainWindow: BrowserWindow | null = null;
let actionsWindow: BrowserWindow | null = null;
let previousAppForActions = '';
let tray: Tray | null = null;
let previousApp = '';
let currentShortcut = GLOBAL_SHORTCUT;
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

function drawScissors(size: number, rgb: [number, number, number] = [0, 0, 0]): Buffer {
  const buf = Buffer.alloc(size * size * 4, 0);
  const S = (v: number) => (v / 22) * size;

  function setPixel(x: number, y: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
  }

  function drawRing(cx: number, cy: number, innerR: number, outerR: number): void {
    for (let py = cy - outerR - 1; py <= cy + outerR + 1; py++) {
      for (let px = cx - outerR - 1; px <= cx + outerR + 1; px++) {
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (d2 >= innerR ** 2 && d2 <= outerR ** 2) setPixel(px, py);
      }
    }
  }

  function fillCircle(cx: number, cy: number, radius: number): void {
    for (let py = cy - radius; py <= cy + radius; py++) {
      for (let px = cx - radius; px <= cx + radius; px++) {
        if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) setPixel(px, py);
      }
    }
  }

  function drawThickLine(x0: number, y0: number, x1: number, y1: number, thick: number): void {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const half = thick / 2;
      for (let ox = -half; ox <= half; ox += 0.5) {
        for (let oy = -half; oy <= half; oy += 0.5) {
          if (ox * ox + oy * oy <= half * half) setPixel(cx + ox, cy + oy);
        }
      }
    }
  }

  const ringCx1 = S(5), ringCy1 = S(5);
  const ringCx2 = S(5), ringCy2 = S(17);
  const pivot = { x: S(10), y: S(11) };
  const ringInner = S(1.6), ringOuter = S(3.2);
  const stemThick = S(1.4);

  // Hollow handle rings
  drawRing(ringCx1, ringCy1, ringInner, ringOuter);
  drawRing(ringCx2, ringCy2, ringInner, ringOuter);

  // Stems: start from ring edge (not center) toward pivot
  function stemStart(ringCx: number, ringCy: number): { x: number; y: number } {
    const dx = pivot.x - ringCx, dy = pivot.y - ringCy;
    const len = Math.sqrt(dx * dx + dy * dy);
    return { x: ringCx + (dx / len) * ringOuter, y: ringCy + (dy / len) * ringOuter };
  }
  const s1 = stemStart(ringCx1, ringCy1);
  const s2 = stemStart(ringCx2, ringCy2);
  drawThickLine(s1.x, s1.y, pivot.x, pivot.y, stemThick);
  drawThickLine(s2.x, s2.y, pivot.x, pivot.y, stemThick);

  // Blades
  drawThickLine(pivot.x, pivot.y, S(20), S(7), S(0.9));
  drawThickLine(pivot.x, pivot.y, S(20), S(15), S(0.9));

  // Pivot dot
  fillCircle(pivot.x, pivot.y, S(1.2));

  return buf;
}

function createTrayIcon(): Electron.NativeImage {
  const size = 44; // 22pt @2x
  const img = nativeImage.createFromBuffer(drawScissors(size), { width: size, height: size, scaleFactor: 2.0 });
  img.setTemplateImage(true);
  return img;
}

function createDockIcon(): Electron.NativeImage {
  const size = 512;
  return nativeImage.createFromBuffer(drawScissors(size, [255, 255, 255]), { width: size, height: size });
}

function log(msg: string): void {
  if (!DEBUG) return;
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(path.join(app.getPath('userData'), 'pastry-debug.log'), line);
  console.log('[pastry]', msg);
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 750,
    height: 560,
    minWidth: 500,
    minHeight: 300,
    frame: false,
    alwaysOnTop: true,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Hide window when it loses focus so it feels like a palette.
  mainWindow.on('blur', () => {
    if (openPreviewCount > 0) return;
    mainWindow?.hide();
  });
};

const createActionsWindow = () => {
  actionsWindow = new BrowserWindow({
    width: 640,
    height: 420,
    minWidth: 480,
    minHeight: 300,
    frame: false,
    alwaysOnTop: true,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    actionsWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?panel=actions`);
  } else {
    actionsWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { search: 'panel=actions' },
    );
  }

  actionsWindow.on('blur', () => {
    actionsWindow?.hide();
  });
};

ipcMain.on('window:hide', () => {
  mainWindow?.hide();
});

ipcMain.on('actions-window:hide', () => {
  actionsWindow?.hide();
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

// Track what Pastry itself writes so the watcher doesn't re-add it to history.
let lastClipboardText = '';
let lastImageSignature = ''; // PNG-buffer length + first 16 bytes as hex

function imageSignature(native: Electron.NativeImage): string {
  const { width, height } = native.getSize();
  const bitmap = native.toBitmap();
  // Sample a few pixels spread across the bitmap for a fast but reliable signature.
  const stride = Math.max(1, Math.floor(bitmap.length / 8));
  let sample = '';
  for (let i = 0; i < bitmap.length; i += stride) sample += bitmap[i].toString(16);
  return `${width}x${height}:${sample}`;
}
let openPreviewCount = 0;

ipcMain.on('clipboard:write', (_event, text: string) => {
  lastClipboardText = text;
  lastImageSignature = '';
  if (text === '') {
    clipboard.clear();
  } else {
    clipboard.writeText(text);
  }
});

ipcMain.on('clipboard:write-rich', (_event, payload: { text: string; htmlContent: string }) => {
  lastClipboardText = payload.text;
  lastImageSignature = '';
  clipboard.write({ text: payload.text, html: payload.htmlContent });
});

ipcMain.on('clipboard:history-deleted', (_event, payload: { text?: string; imageDataUrl?: string }) => {
  if (payload.imageDataUrl) {
    const sig = imageSignature(nativeImage.createFromDataURL(payload.imageDataUrl));
    if (sig === lastImageSignature) lastImageSignature = '';
  } else if (payload.text !== undefined && payload.text === lastClipboardText) {
    lastClipboardText = '';
  }
});

ipcMain.on('clipboard:write-image', (_event, dataUrl: string) => {
  const native = nativeImage.createFromDataURL(dataUrl);
  lastImageSignature = imageSignature(native);
  lastClipboardText = '';
  clipboard.writeImage(native);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'pastry-store.json');
}

ipcMain.handle('store:load', () => {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data?.maxImageSizeMb === 'number' && data.maxImageSizeMb > 0) {
      imageSizeLimitBytes = data.maxImageSizeMb * 1024 * 1024;
    }
    return data;
  } catch {
    return null;
  }
});

ipcMain.on('store:save', (_event, data: unknown) => {
  try {
    // Preserve the `actions` key (owned by the actions:save handler) when the
    // clipboard/pins store — which doesn't know about actions — writes the file.
    let existingActions: unknown;
    try {
      existingActions = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8')).actions;
    } catch {
      existingActions = undefined;
    }
    const merged = existingActions !== undefined ? { ...(data as object), actions: existingActions } : data;
    fs.writeFileSync(getStorePath(), JSON.stringify(merged), 'utf-8');
  } catch (err) {
    console.error('[pastry] store:save failed:', err);
  }
});

ipcMain.handle('actions:load', () => {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data?.actions) ? data.actions : [];
  } catch {
    return [];
  }
});

ipcMain.on('actions:save', (_event, actionsData: unknown) => {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8'));
  } catch {
    // No store file yet — start fresh.
  }
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ ...existing, actions: actionsData }), 'utf-8');
  } catch (err) {
    console.error('[pastry] actions:save failed:', err);
  }
});

// ---------------------------------------------------------------------------
// Action execution — Terminal
// ---------------------------------------------------------------------------

function escapeForAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Runs a paste-group sequence: activates `targetApp` (if given), then for each
 * segment sets the clipboard and sends Cmd+V, followed by the separator key
 * (Tab/Enter) from `separators[i]` when present (one fewer separator than segments).
 * `postDelaySec[i]`, when given, overrides the default 0.08s pause after that
 * separator's keystroke — used to give an in-memory page transition time to settle
 * before the next paste, since that gap lives inside this one AppleScript run. */
function runPasteGroup(segments: string[], separators: string[], targetApp: string, postDelaySec: Record<number, number> = {}): void {
  const lines: string[] = [];
  if (targetApp) {
    lines.push(`set frontmost of (first application process whose name is "${targetApp}") to true`);
  }
  for (let i = 0; i < segments.length; i++) {
    const escaped = escapeForAppleScriptString(segments[i]);
    lines.push(`set the clipboard to "${escaped}"`);
    lines.push(`keystroke "v" using command down`);
    if (i < separators.length && separators[i] !== '[NONE]') {
      lines.push(`delay 0.08`);
      const sep = separators[i];
      lines.push(sep === '[ENTER]' ? `key code 36` : `key code 48`); // Return : Tab
      lines.push(`delay ${postDelaySec[i] ?? 0.08}`);
    }
  }
  const osaLines = lines.map((l) => `-e 'tell application "System Events" to ${l}'`).join(' ');
  const script = `osascript ${osaLines}`;
  log(`paste-groups triggered (${segments.length} segments), targetApp=${JSON.stringify(targetApp)}`);
  exec(script, (err, stdout, stderr) => {
    if (err) log(`paste-groups failed: ${err.message} | stderr: ${stderr}`);
    else log(`paste-groups succeeded stdout=${stdout.trim()}`);
  });
}

/** POSIX single-quote shell escaping — safe against $()/backtick command substitution,
 * unlike JSON.stringify which only escapes characters meaningful to a double-quoted string. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Expands a leading `~` to the home directory ourselves — single-quoting (shellQuote)
 * disables all shell expansion, including `~`, so it must be resolved before quoting. */
function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

ipcMain.on('action:run-terminal', (_event, payload: { command: string; workingDirectory: string }) => {
  const dir = expandHome(payload.workingDirectory.trim());
  const cmd = payload.command.trim();
  const shellLine = dir ? `cd ${shellQuote(dir)} && ${cmd}` : cmd;
  const script = `tell application "Terminal"
    activate
    do script ${JSON.stringify(shellLine)}
  end tell`;
  exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout, stderr) => {
    if (err) log(`action:run-terminal failed: ${err.message} | stderr: ${stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Action execution — URL
// ---------------------------------------------------------------------------

ipcMain.on('action:run-url', (_event, payload: { url: string }) => {
  // execFile bypasses the shell entirely, so the URL can't trigger command substitution.
  execFile('open', [payload.url], (err, stdout, stderr) => {
    if (err) log(`action:run-url failed: ${err.message} | stderr: ${stderr}`);
  });
});

ipcMain.on('settings:max-image-size-mb', (_event, mb: number) => {
  if (typeof mb === 'number' && mb > 0) {
    imageSizeLimitBytes = mb * 1024 * 1024;
  }
});

ipcMain.handle('pins:export', async (_event, data: unknown) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Pins',
    defaultPath: 'pins.pastry',
    filters: [{ name: 'Pastry Export', extensions: ['pastry'] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(data), 'utf-8');
  return true;
});

ipcMain.handle('pins:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Pins',
    filters: [{ name: 'Pastry Export', extensions: ['pastry'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.on('clipboard:paste', (_event, payload: { text?: string; imageDataUrl?: string; htmlContent?: string }) => {
  mainWindow?.hide();
  const target = previousApp;

  // Paste group token pattern — [TAB] or [ENTER], case-insensitive
  const GROUP_TOKEN = /(\[TAB\]|\[ENTER\])/i;

  const isGroupPaste = !payload.imageDataUrl && !payload.htmlContent && GROUP_TOKEN.test(payload.text ?? '');

  if (isGroupPaste) {
    // Split into alternating [text, separator, text, separator, …] parts
    const rawParts = (payload.text ?? '').split(GROUP_TOKEN);
    // rawParts: ['seg0', '[TAB]', 'seg1', '[ENTER]', 'seg2', …]
    const segments: string[] = [];
    const separators: string[] = []; // one fewer than segments
    for (let i = 0; i < rawParts.length; i++) {
      if (i % 2 === 0) {
        segments.push(rawParts[i]);
      } else {
        separators.push(rawParts[i].toUpperCase());
      }
    }

    runPasteGroup(segments, separators, target);
    return;
  }

  // Standard single-paste path — track what we write so the watcher doesn't re-add it.
  if (payload.imageDataUrl) {
    const native = nativeImage.createFromDataURL(payload.imageDataUrl);
    lastImageSignature = imageSignature(native);
    lastClipboardText = '';
    clipboard.writeImage(native);
  } else if (payload.htmlContent) {
    lastClipboardText = payload.text ?? '';
    lastImageSignature = '';
    clipboard.write({ text: payload.text ?? '', html: payload.htmlContent });
  } else {
    lastClipboardText = payload.text ?? '';
    lastImageSignature = '';
    clipboard.writeText(payload.text ?? '');
  }
  // osascript runs as a child of Electron, which has Accessibility — so keying
  // is allowed without any extra osascript entry in System Preferences.
  const script = target
    ? `osascript -e 'tell application "System Events" to set frontmost of (first application process whose name is "${target}") to true' -e 'tell application "System Events" to keystroke "v" using command down'`
    : `osascript -e 'tell application "System Events" to keystroke "v" using command down'`;
  log(`paste triggered, previousApp=${JSON.stringify(target)}`);
  log(`running script: ${script}`);
  exec(script, (err, stdout, stderr) => {
    if (err) log(`paste failed: ${err.message} | stderr: ${stderr}`);
    else log(`paste succeeded stdout=${stdout.trim()}`);
  });
});

// Paste without hiding the window — used by sequential paste so the user can
// keep pressing the shortcut/button without reopening Pastry each time.
ipcMain.on('clipboard:paste-keep-open', (_event, payload: { text?: string; imageDataUrl?: string; htmlContent?: string }) => {
  // Track what we're writing so the watcher doesn't re-add it as a new history entry.
  if (payload.imageDataUrl) {
    const native = nativeImage.createFromDataURL(payload.imageDataUrl);
    lastImageSignature = imageSignature(native);
    lastClipboardText = '';
    clipboard.writeImage(native);
  } else if (payload.htmlContent) {
    lastClipboardText = payload.text ?? '';
    lastImageSignature = '';
    clipboard.write({ text: payload.text ?? '', html: payload.htmlContent });
  } else {
    lastClipboardText = payload.text ?? '';
    lastImageSignature = '';
    clipboard.writeText(payload.text ?? '');
  }
  const target = previousApp;
  const script = target
    ? `osascript -e 'tell application "System Events" to set frontmost of (first application process whose name is "${target}") to true' -e 'tell application "System Events" to keystroke "v" using command down'`
    : `osascript -e 'tell application "System Events" to keystroke "v" using command down'`;
  exec(script, (err, _stdout, stderr) => {
    if (err) log(`paste-keep-open failed: ${err.message} | stderr: ${stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Clipboard watcher
// ---------------------------------------------------------------------------

const DEFAULT_MAX_IMAGE_SIZE_MB = 5;
let imageSizeLimitBytes = DEFAULT_MAX_IMAGE_SIZE_MB * 1024 * 1024;

function startClipboardWatcher(): void {
  let tick = 0;
  setInterval(() => {
    tick++;

    // Check text on every tick — readText() is cheap.
    const current = clipboard.readText();
    if (current !== lastClipboardText) {
      lastClipboardText = current;
      lastImageSignature = '';
      const html = clipboard.readHTML();
      // Only capture HTML if it actually adds information beyond plain text
      // (i.e. it contains markup tags, not just a plain-text wrapper).
      const htmlContent = html && /<[a-z]/i.test(html) ? html : undefined;
      mainWindow?.webContents.send('clipboard:change', { text: current, imageDataUrl: undefined, htmlContent });
      return;
    }

    // Check for images only every 4 ticks (~2s) — readImage()+toPNG() is expensive.
    if (tick % 4 !== 0) return;

    const img = clipboard.readImage();
    if (img.isEmpty()) return;

    const sig = imageSignature(img);
    if (sig === lastImageSignature) return;

    let dataUrl = img.toDataURL();
    if (dataUrl.length > imageSizeLimitBytes) {
      dataUrl = img.toJPEG(85).toString('base64');
      dataUrl = `data:image/jpeg;base64,${dataUrl}`;
    }
    lastImageSignature = sig;
    lastClipboardText = '';
    if (dataUrl.length <= imageSizeLimitBytes) {
      mainWindow?.webContents.send('clipboard:change', { imageDataUrl: dataUrl, text: '' });
    }
  }, POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Window toggle
// ---------------------------------------------------------------------------

function toggleWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      (err, stdout, stderr) => {
        if (err) {
          log(`capture frontmost failed: ${err.message} | stderr: ${stderr}`);
        } else {
          previousApp = stdout.trim();
          log(`captured previousApp: ${JSON.stringify(previousApp)}`);
        }
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('window:shown');
        app.show();
      },
    );
  }
}

function toggleActionsWindow(): void {
  if (!actionsWindow) return;
  if (actionsWindow.isVisible()) {
    actionsWindow.hide();
  } else {
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      (err, stdout, stderr) => {
        if (err) {
          log(`capture frontmost (actions) failed: ${err.message} | stderr: ${stderr}`);
        } else {
          previousAppForActions = stdout.trim();
          log(`captured previousAppForActions: ${JSON.stringify(previousAppForActions)}`);
        }
        actionsWindow?.show();
        actionsWindow?.focus();
        actionsWindow?.webContents.send('actions-window:shown');
        app.show();
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Global shortcut IPC
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reminder popup window
// ---------------------------------------------------------------------------

const REMINDER_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100vh;
    background: #1e1e1e; display: flex; flex-direction: column;
    overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #titlebar {
    -webkit-app-region: drag;
    height: 28px; background: #2a2a2a; display: flex; align-items: center;
    padding: 0 14px; flex-shrink: 0; font-size: 12px; font-weight: 600;
    color: #aaa; border-bottom: 1px solid #3a3a3a; box-sizing: border-box; gap: 6px;
  }
  #body {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 14px 20px; gap: 12px;
  }
  #label {
    font-size: 15px; font-weight: 600; color: #e8e8e8; text-align: center;
    word-break: break-word; max-width: 320px;
  }
  #snooze-row {
    display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
  }
  .snooze-btn {
    -webkit-app-region: no-drag;
    background: #2e2e2e; border: 1px solid #444; border-radius: 5px; color: #ccc;
    cursor: pointer; font-size: 11px; font-weight: 600; padding: 5px 10px;
    transition: background 0.1s, color 0.1s;
  }
  .snooze-btn:hover { background: #3a3a3a; color: #fff; }
  #dismiss {
    -webkit-app-region: no-drag;
    background: #4c8ef7; border: none; border-radius: 6px; color: #fff;
    cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 22px;
    transition: background 0.1s;
  }
  #dismiss:hover { background: #6aa0ff; }
  #snooze-label {
    font-size: 10px; color: #666; letter-spacing: 0.04em; text-transform: uppercase;
  }
</style>
</head><body>
<div id="titlebar"><span>&#128276;</span><span>Reminder</span></div>
<div id="body">
  <div id="label"></div>
  <button id="dismiss" onclick="window.close()">Dismiss</button>
  <div id="snooze-label">Snooze</div>
  <div id="snooze-row">
    <button class="snooze-btn" data-ms="300000">5 min</button>
    <button class="snooze-btn" data-ms="600000">10 min</button>
    <button class="snooze-btn" data-ms="1800000">30 min</button>
    <button class="snooze-btn" data-ms="3600000">1 hr</button>
    <button class="snooze-btn" data-ms="tomorrow">Tomorrow</button>
  </div>
</div>
<script>
  if (window.pastryAPI && window.pastryAPI.onReminderData) {
    window.pastryAPI.onReminderData(function(data) {
      document.getElementById('label').textContent = data.label;
      document.title = 'Reminder - ' + data.label;
      document.querySelectorAll('.snooze-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var raw = btn.getAttribute('data-ms');
          var snoozeMs;
          if (raw === 'tomorrow') {
            var t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0);
            snoozeMs = t.getTime() - Date.now();
          } else {
            snoozeMs = parseInt(raw, 10);
          }
          window.pastryAPI.snoozeReminder({ pinId: data.pinId, label: data.label, snoozeMs: snoozeMs });
          window.close();
        });
      });
    });
  }
</script>
</body></html>`;

function openReminderWindow(label: string, pinId: string): void {
  reminderTimers.delete(pinId);
  const win = new BrowserWindow({
    width: 380,
    height: 220,
    resizable: false,
    title: `Reminder - ${label}`,
    show: false,
    alwaysOnTop: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(REMINDER_HTML)}`);
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('reminder:data', { label, pinId });
    win.show();
  });
}

ipcMain.on('reminder:set', (_event, data: { pinId: string; label: string; reminderAt: number }) => {
  const existing = reminderTimers.get(data.pinId);
  if (existing !== undefined) clearTimeout(existing);
  const delay = data.reminderAt - Date.now();
  if (delay <= 0) return; // already past, skip silently
  const timer = setTimeout(() => openReminderWindow(data.label, data.pinId), delay);
  reminderTimers.set(data.pinId, timer);
});

ipcMain.on('reminder:cancel', (_event, pinId: string) => {
  const existing = reminderTimers.get(pinId);
  if (existing !== undefined) clearTimeout(existing);
  reminderTimers.delete(pinId);
});

ipcMain.on('reminder:snooze', (_event, data: { pinId: string; label: string; snoozeMs: number }) => {
  const existing = reminderTimers.get(data.pinId);
  if (existing !== undefined) clearTimeout(existing);
  const newReminderAt = Date.now() + data.snoozeMs;
  const timer = setTimeout(() => openReminderWindow(data.label, data.pinId), data.snoozeMs);
  reminderTimers.set(data.pinId, timer);
  mainWindow?.webContents.send('reminder:snoozed', { pinId: data.pinId, reminderAt: newReminderAt });
});

// ---------------------------------------------------------------------------
// Image preview window
// ---------------------------------------------------------------------------

const IMAGE_PREVIEW_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100vh;
    background: #1e1e1e; display: flex; flex-direction: column;
    overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #titlebar {
    -webkit-app-region: drag;
    height: 28px; background: #2a2a2a; display: flex; align-items: center;
    padding: 0 14px; flex-shrink: 0; font-size: 12px; font-weight: 600;
    color: #aaa; border-bottom: 1px solid #3a3a3a; box-sizing: border-box;
  }
  #img-wrap {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 12px; overflow: hidden;
  }
  img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; border-radius: 4px; }
</style>
</head><body>
<div id="titlebar">Image</div>
<div id="img-wrap"><img id="img" alt="" /></div>
<script>
  if (window.pastryAPI && window.pastryAPI.onImagePreviewData) {
    window.pastryAPI.onImagePreviewData(function(data) {
      document.getElementById('img').src = data.dataUrl;
      document.getElementById('titlebar').textContent = data.title;
      document.title = data.title;
    });
  }
</script>
</body></html>`;

ipcMain.on('image-preview:open', (_event, payload: { dataUrl: string; title: string }) => {
  const win = new BrowserWindow({
    width: 600,
    height: 520,
    minWidth: 300,
    minHeight: 220,
    title: payload.title,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  openPreviewCount++;
  win.on('closed', () => {
    openPreviewCount--;
  });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(IMAGE_PREVIEW_HTML)}`);
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('image-preview:data', payload);
    win.show();
  });
});

// ---------------------------------------------------------------------------
// History-full warning window
// ---------------------------------------------------------------------------

const HISTORY_FULL_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100vh;
    background: #1e1e1e; display: flex; flex-direction: column;
    overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #titlebar {
    -webkit-app-region: drag;
    height: 28px; background: #2a2a2a; display: flex; align-items: center;
    padding: 0 14px; flex-shrink: 0; font-size: 12px; font-weight: 600;
    color: #aaa; border-bottom: 1px solid #3a3a3a; box-sizing: border-box; gap: 6px;
  }
  #body {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 20px 24px; gap: 14px; text-align: center;
  }
  #message {
    font-size: 14px; color: #e8e8e8; line-height: 1.5; max-width: 300px;
  }
  #sub {
    font-size: 12px; color: #888; max-width: 300px; line-height: 1.4;
  }
  #dismiss {
    -webkit-app-region: no-drag;
    background: #4c8ef7; border: none; border-radius: 6px; color: #fff;
    cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 22px;
    transition: background 0.1s; margin-top: 4px;
  }
  #dismiss:hover { background: #6aa0ff; }
</style>
</head><body>
<div id="titlebar"><span>⚠️</span><span>History Full</span></div>
<div id="body">
  <div id="message">Your clipboard history is full.</div>
  <div id="sub">The oldest item will be removed each time a new one is added. Increase the history size in Settings to keep more items.</div>
  <button id="dismiss" onclick="window.close()">Got it</button>
</div>
<script>
  if (window.pastryAPI && window.pastryAPI.onHistoryFullData) {
    window.pastryAPI.onHistoryFullData(function(data) {
      document.getElementById('message').textContent =
        'Your clipboard history is full (' + data.historySize + ' items).';
    });
  }
</script>
</body></html>`;

let historyFullWindowOpen = false;

ipcMain.on('history:full', (_event, historySize: number) => {
  if (historyFullWindowOpen) return;
  historyFullWindowOpen = true;
  const win = new BrowserWindow({
    width: 380,
    height: 230,
    resizable: false,
    title: 'History Full',
    show: false,
    alwaysOnTop: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('closed', () => { historyFullWindowOpen = false; });
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HISTORY_FULL_HTML)}`);
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('history-full:data', { historySize });
    win.show();
  });
});

ipcMain.handle('shortcut:register', (_event, newShortcut: string) => {
  globalShortcut.unregister(currentShortcut);
  const ok = globalShortcut.register(newShortcut, toggleWindow);
  if (ok) {
    currentShortcut = newShortcut;
  } else {
    // Restore the previous shortcut so the app remains accessible.
    globalShortcut.register(currentShortcut, toggleWindow);
  }
  return ok;
});

// ---------------------------------------------------------------------------
// Form action — "waiting for page to load" popup
// ---------------------------------------------------------------------------

const FORM_WAITING_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100vh;
    background: #1e1e1e; display: flex; flex-direction: column;
    overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #titlebar {
    -webkit-app-region: drag;
    height: 28px; background: #2a2a2a; display: flex; align-items: center;
    padding: 0 14px; flex-shrink: 0; font-size: 12px; font-weight: 600;
    color: #aaa; border-bottom: 1px solid #3a3a3a; box-sizing: border-box; gap: 6px;
  }
  #body {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 16px 20px; gap: 14px; text-align: center;
  }
  #message { font-size: 13px; color: #e8e8e8; line-height: 1.5; max-width: 300px; }
  #done {
    -webkit-app-region: no-drag;
    background: #4c8ef7; border: none; border-radius: 6px; color: #fff;
    cursor: pointer; font-size: 13px; font-weight: 600; padding: 7px 24px;
  }
  #done:hover { background: #6aa0ff; }
  #hint { font-size: 11px; color: #777; }
</style>
</head><body>
<div id="titlebar"><span>⏳</span><span>Pastry — Form Action</span></div>
<div id="body">
  <div id="message">Waiting for the page to load. Click into the field to fill, then click Done.</div>
  <button id="done">Done</button>
  <div id="hint">Esc to cancel</div>
</div>
<script>
  document.getElementById('done').addEventListener('click', function() {
    window.pastryAPI.completeFormAction();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') window.pastryAPI.cancelFormAction();
  });
</script>
</body></html>`;

let formWaitingWindow: BrowserWindow | null = null;
let pendingFormSteps: FormStep[] = [];
let pendingFormTargetApp = '';
let pendingFormStepIndex = 0;
let formAdvancing = false;

// Post-keystroke delay (baked into the AppleScript, see buildPasteGroup) used in place
// of the waiting popup when a step has waitForLoad:false — this is the only pause an
// in-memory/JS-only page transition gets before the next field is pasted into it, so
// keep it comfortably above a typical client-side route change / re-render.
const SKIP_WAIT_DELAY_MS = 600;

ipcMain.on('action:run-form', (_event, payload: { url: string; steps: FormStep[] }) => {
  // Discard any previous unresolved popup rather than leaving it orphaned on screen.
  formWaitingWindow?.close();
  pendingFormSteps = payload.steps;
  pendingFormStepIndex = 0;
  // execFile bypasses the shell entirely, so the URL can't trigger command substitution.
  execFile('open', [payload.url], (err, _stdout, stderr) => {
    if (err) log(`action:run-form open failed: ${err.message} | stderr: ${stderr}`);
  });

  // Give the browser a moment to become frontmost, then capture it as the paste target.
  setTimeout(() => {
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      (err, stdout) => {
        pendingFormTargetApp = err ? '' : stdout.trim();
        openFormWaitingWindow();
      },
    );
  }, 600);
});

/** Builds paste-group segments/separators/per-separator delays for a contiguous run of
 * steps. A step with `waitForLoad: false` gets a longer post-keystroke delay before the
 * next paste, giving an in-memory/JS-only page transition time to settle — the whole
 * chunk still runs as one AppleScript invocation, so this delay must live in the script
 * itself rather than as a setTimeout in Node (which would only run before the script
 * starts, not between keystrokes inside it). */
function buildPasteGroup(steps: FormStep[]): { segments: string[]; separators: string[]; postDelaySec: Record<number, number> } {
  const segments = steps.map((s) => s.value);
  const separators = steps.slice(0, -1).map((s) =>
    s.then === 'enter' ? '[ENTER]' : s.then === 'tab' ? '[TAB]' : '[NONE]',
  );
  const postDelaySec: Record<number, number> = {};
  steps.slice(0, -1).forEach((s, i) => {
    if (s.waitForLoad === false) postDelaySec[i] = SKIP_WAIT_DELAY_MS / 1000;
  });
  // The last step's own "then" (e.g. Enter to submit, or Enter to advance to the next
  // page) still needs to fire after its paste, so treat it as a trailing separator
  // followed by an empty final segment.
  if (steps.length > 0 && steps[steps.length - 1].then !== 'none') {
    const last = steps[steps.length - 1];
    separators.push(last.then === 'enter' ? '[ENTER]' : '[TAB]');
    segments.push('');
    if (last.waitForLoad === false) postDelaySec[separators.length - 1] = SKIP_WAIT_DELAY_MS / 1000;
  }
  return { segments, separators, postDelaySec };
}

/** Runs steps starting at `startIndex`, extending the paste-group burst through any run
 * of steps whose OWN `waitForLoad` is false (so they fire back-to-back within one
 * AppleScript invocation, each with a settle delay baked in before the next paste), then
 * stops at the first step that wants the waiting popup — or the end. */
function runFormStepsFrom(startIndex: number): void {
  const steps = pendingFormSteps;
  if (startIndex >= steps.length) return;

  let end = startIndex;
  do {
    end++;
  } while (end < steps.length && steps[end - 1].waitForLoad === false);

  const { segments, separators, postDelaySec } = buildPasteGroup(steps.slice(startIndex, end));
  runPasteGroup(segments, separators, pendingFormTargetApp, postDelaySec);
  if (end < steps.length) {
    pendingFormStepIndex = end;
    openFormWaitingWindow();
  } else {
    clearPendingFormState();
  }
}

function openFormWaitingWindow(): void {
  formWaitingWindow = new BrowserWindow({
    width: 340,
    height: 180,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // "Done" sets formAdvancing first so this handler can tell a deliberate step advance
  // apart from any other dismissal (Esc/form-cancel, or the OS close button), which
  // should cancel the whole form rather than leaving pendingFormSteps dangling.
  formWaitingWindow.on('closed', () => {
    formWaitingWindow = null;
    if (!formAdvancing) clearPendingFormState();
    formAdvancing = false;
  });
  formWaitingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(FORM_WAITING_HTML)}`);
  formWaitingWindow.webContents.once('did-finish-load', () => formWaitingWindow?.show());
}

function clearPendingFormState(): void {
  pendingFormSteps = [];
  pendingFormTargetApp = '';
  pendingFormStepIndex = 0;
}

ipcMain.on('action:form-complete', () => {
  // BrowserWindow.close() is async — its 'closed' event (which clears
  // formWaitingWindow) fires on a later tick. Advancing to the next step opens a NEW
  // popup and reassigns formWaitingWindow immediately, so if that reassignment happens
  // before the old window's 'closed' fires, the handler would null out the *new*
  // window's reference instead of the old one. Running the next step only once the
  // close has actually completed avoids that race.
  formAdvancing = true;
  const closingWindow = formWaitingWindow;
  if (closingWindow) {
    closingWindow.once('closed', () => runFormStepsFrom(pendingFormStepIndex));
    closingWindow.close();
  } else {
    runFormStepsFrom(pendingFormStepIndex);
  }
});

ipcMain.on('action:form-cancel', () => {
  formWaitingWindow?.close();
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('ready', () => {
  // Read stored shortcut before registering so user's preference is used
  // immediately on startup (same file main uses for store:load).
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data.shortcut === 'string' && data.shortcut) {
      currentShortcut = data.shortcut;
    }
  } catch {
    // File doesn't exist yet or is invalid — use the default.
  }

  createWindow();
  createActionsWindow();
  startClipboardWatcher();
  globalShortcut.register(currentShortcut, toggleWindow);
  if (!globalShortcut.register(ACTIONS_SHORTCUT, toggleActionsWindow)) {
    console.error(`[pastry] failed to register actions shortcut ${ACTIONS_SHORTCUT} — likely already bound by another app`);
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Pastry');
  tray.on('click', toggleWindow);

  app.dock?.setIcon(createDockIcon());
  app.setName('Pastry');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  for (const timer of reminderTimers.values()) clearTimeout(timer);
  reminderTimers.clear();
});

// Keep the app running in the background even when all windows are closed.
app.on('window-all-closed', () => {
  // Do not quit — the window is hidden, not destroyed.
});

// Show the window when the user clicks the dock icon (macOS).
app.on('activate', () => {
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

