import { contextBridge, ipcRenderer } from 'electron';
import type { PastryAPI } from './window';

const api: PastryAPI = {
  writeClipboard(text: string): void {
    ipcRenderer.send('clipboard:write', text);
  },

  writeRichClipboard(payload: { text: string; htmlContent: string }): void {
    ipcRenderer.send('clipboard:write-rich', payload);
  },

  writeImageClipboard(dataUrl: string): void {
    ipcRenderer.send('clipboard:write-image', dataUrl);
  },

  pasteItem(payload): void {
    ipcRenderer.send('clipboard:paste', payload);
  },

  onClipboardChange(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { text: string; imageDataUrl?: string; htmlContent?: string }) =>
      callback(payload);
    ipcRenderer.on('clipboard:change', handler);
    return () => ipcRenderer.removeListener('clipboard:change', handler);
  },

  loadStore() {
    return ipcRenderer.invoke('store:load');
  },

  saveStore(data) {
    ipcRenderer.send('store:save', data);
  },

  hideWindow() {
    ipcRenderer.send('window:hide');
  },

  registerShortcut(shortcut: string): Promise<boolean> {
    return ipcRenderer.invoke('shortcut:register', shortcut);
  },

  exportPins(data: unknown): Promise<boolean> {
    return ipcRenderer.invoke('pins:export', data);
  },

  importPins(): Promise<unknown> {
    return ipcRenderer.invoke('pins:import');
  },

  notifyHistoryDeleted(payload): void {
    ipcRenderer.send('clipboard:history-deleted', payload);
  },
};

contextBridge.exposeInMainWorld('pastryAPI', api);
