import { addToHistory, loadPersistedStore, themeMode } from './store/clipboard-store';
import './components/pastry-app';

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------

function applyTheme(): void {
  const mode = themeMode.get();
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

// React to signal changes.
themeMode.subscribe(applyTheme);

// React to OS preference changes when in auto mode.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// Hydrate signals from persisted state before the first render, then apply theme.
loadPersistedStore().then(() => applyTheme());

// Start listening for clipboard changes pushed from the main process.
window.pastryAPI.onClipboardChange((payload) => {
  addToHistory(payload);
});

