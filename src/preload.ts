import { contextBridge, ipcRenderer } from 'electron';
import type { PastryAPI } from './window';

const api: PastryAPI = {
  writeClipboard(text: string): void {
    ipcRenderer.send('clipboard:write', text);
  },

  writeImageClipboard(dataUrl: string): void {
    ipcRenderer.send('clipboard:write-image', dataUrl);
  },

  pasteItem(payload): void {
    ipcRenderer.send('clipboard:paste', payload);
  },

  onClipboardChange(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { text: string; imageDataUrl?: string }) =>
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
};

contextBridge.exposeInMainWorld('pastryAPI', api);
