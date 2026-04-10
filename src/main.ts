import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { GLOBAL_SHORTCUT, POLL_INTERVAL_MS } from './constants';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let previousApp = '';

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

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.on('clipboard:write', (_event, text: string) => {
  clipboard.writeText(text);
});

ipcMain.on('clipboard:write-image', (_event, dataUrl: string) => {
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
  exec(script, (err) => {
    if (err) console.error('[pastry] paste failed:', err.message);
  });
});

// ---------------------------------------------------------------------------
// Clipboard watcher
// ---------------------------------------------------------------------------

const IMAGE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB data-URL cap
let lastClipboardText = '';
let lastImageSignature = ''; // length+prefix to detect changes without full compare

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

app.on('ready', () => {
  createWindow();
  startClipboardWatcher();

  globalShortcut.register(GLOBAL_SHORTCUT, () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      // Capture the currently active app before stealing focus.
      exec(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
        (err, stdout) => {
          if (err) {
            console.error('[pastry] capture frontmost failed:', err.message);
          } else {
            previousApp = stdout.trim();
            console.log('[pastry] captured previousApp:', JSON.stringify(previousApp));
          }
          mainWindow?.show();
          mainWindow?.focus();
          app.show();
        },
      );
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep the app running in the background even when all windows are closed.
app.on('window-all-closed', () => {
  // Do not quit — the window is hidden, not destroyed.
});

