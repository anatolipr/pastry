import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, nativeImage } from 'electron';
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
let previousApp = '';
let currentShortcut = GLOBAL_SHORTCUT;

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

ipcMain.on('clipboard:write', (_event, text: string) => {
  lastClipboardText = text;
  lastImageSignature = '';
  if (text === '') {
    clipboard.clear();
  } else {
    clipboard.writeText(text);
  }
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

ipcMain.on('clipboard:paste', (_event, payload: { text?: string; imageDataUrl?: string }) => {
  if (payload.imageDataUrl) {
    clipboard.writeImage(nativeImage.createFromDataURL(payload.imageDataUrl));
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
      mainWindow?.webContents.send('clipboard:change', { text: current, imageDataUrl: undefined });
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
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep the app running in the background even when all windows are closed.
app.on('window-all-closed', () => {
  // Do not quit — the window is hidden, not destroyed.
});

