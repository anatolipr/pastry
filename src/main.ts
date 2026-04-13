import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { GLOBAL_SHORTCUT, POLL_INTERVAL_MS } from './constants';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const DEBUG = false;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let previousApp = '';
let currentShortcut = GLOBAL_SHORTCUT;

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

ipcMain.on('window:hide', () => {
  mainWindow?.hide();
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

// Track what Pastry itself writes so the watcher doesn't re-add it to history.
let lastClipboardText = '';
let lastImageSignature = ''; // length+prefix to detect changes without full compare
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
    const sig = `${payload.imageDataUrl.length}:${payload.imageDataUrl.slice(0, 40)}`;
    if (sig === lastImageSignature) lastImageSignature = '';
  } else if (payload.text !== undefined && payload.text === lastClipboardText) {
    lastClipboardText = '';
  }
});

ipcMain.on('clipboard:write-image', (_event, dataUrl: string) => {
  const sig = `${dataUrl.length}:${dataUrl.slice(0, 40)}`;
  lastImageSignature = sig;
  lastClipboardText = '';
  clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
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
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.on('store:save', (_event, data: unknown) => {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify(data), 'utf-8');
  } catch (err) {
    console.error('[pastry] store:save failed:', err);
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
  if (payload.imageDataUrl) {
    clipboard.writeImage(nativeImage.createFromDataURL(payload.imageDataUrl));
  } else if (payload.htmlContent) {
    clipboard.write({ text: payload.text ?? '', html: payload.htmlContent });
  } else {
    clipboard.writeText(payload.text ?? '');
  }
  mainWindow?.hide();
  const target = previousApp;
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

// ---------------------------------------------------------------------------
// Clipboard watcher
// ---------------------------------------------------------------------------

const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB data-URL cap

function startClipboardWatcher(): void {
  setInterval(() => {
    const img = clipboard.readImage();
    if (!img.isEmpty()) {
      const dataUrl = img.toDataURL();
      const sig = `${dataUrl.length}:${dataUrl.slice(0, 40)}`;
      if (sig !== lastImageSignature) {
        lastImageSignature = sig;
        lastClipboardText = '';
        if (dataUrl.length <= IMAGE_SIZE_LIMIT) {
          mainWindow?.webContents.send('clipboard:change', { imageDataUrl: dataUrl, text: '' });
        }
      }
      return;
    }
    // No image — check text
    const current = clipboard.readText();
    if (current !== lastClipboardText) {
      lastClipboardText = current;
      lastImageSignature = '';
      const html = clipboard.readHTML();
      // Only capture HTML if it actually adds information beyond plain text
      // (i.e. it contains markup tags, not just a plain-text wrapper).
      const htmlContent = html && /<[a-z]/i.test(html) ? html : undefined;
      mainWindow?.webContents.send('clipboard:change', { text: current, imageDataUrl: undefined, htmlContent });
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
        app.show();
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Global shortcut IPC
// ---------------------------------------------------------------------------

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
  startClipboardWatcher();
  globalShortcut.register(currentShortcut, toggleWindow);

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Pastry');
  tray.on('click', toggleWindow);

  app.dock?.setIcon(createDockIcon());
  app.setName('Pastry');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep the app running in the background even when all windows are closed.
app.on('window-all-closed', () => {
  // Do not quit — the window is hidden, not destroyed.
});

