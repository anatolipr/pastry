import { addToHistory, loadPersistedStore } from './store/clipboard-store';
import './components/pastry-app';

// Hydrate signals from persisted state before the first render.
loadPersistedStore();

// Start listening for clipboard changes pushed from the main process.
window.pastryAPI.onClipboardChange((payload) => {
  addToHistory(payload);
});

