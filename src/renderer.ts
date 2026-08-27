import { addToHistory, loadPersistedStore, loadPersistedPlaceholderHistory, themeMode } from './store/clipboard-store';
import { loadPersistedActions } from './store/actions-store';

const isActionsPanel = new URLSearchParams(window.location.search).get('panel') === 'actions';

function mount(tag: string): void {
  const el = document.createElement(tag);
  document.getElementById('app-root')!.appendChild(el);
}

if (isActionsPanel) {
  // actions-app.ts doesn't exist yet (Task 7). The specifier must be a non-literal
  // expression (string concat, not a plain string), otherwise Rollup's dynamic-import
  // resolver tries to resolve it at build time (even with @vite-ignore) and the
  // production build fails outright. pastry-app stays a plain static import below so
  // the shipping clipboard panel is always correctly bundled.
  const actionsAppSpecifier = './components/' + 'actions-app';
  import(/* @vite-ignore */ actionsAppSpecifier)
    .then(() => mount('actions-app'))
    .catch((err) => console.error('[pastry] failed to load actions-app (expected until Task 7 lands):', err));
} else {
  import('./components/pastry-app').then(() => mount('pastry-app'));
}

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

if (isActionsPanel) {
  // Only the actions panel needs the actions store hydrated — avoids the clipboard
  // window doing an extra, unused actions:load IPC round trip on every show.
  loadPersistedPlaceholderHistory();
  loadPersistedActions();
  applyTheme();
} else {
  // Hydrate signals from persisted state before the first render, then apply theme.
  loadPersistedPlaceholderHistory();
  loadPersistedStore().then(() => applyTheme());

  // Start listening for clipboard changes pushed from the main process.
  window.pastryAPI.onClipboardChange((payload) => {
    addToHistory(payload);
  });
}
