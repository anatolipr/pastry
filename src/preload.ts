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

  openImagePreview(dataUrl: string, title: string): void {
    ipcRenderer.send('image-preview:open', { dataUrl, title });
  },

  onImagePreviewData(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { dataUrl: string; title: string }) =>
      callback(payload);
    ipcRenderer.once('image-preview:data', handler);
    return () => ipcRenderer.removeListener('image-preview:data', handler);
  },

  setReminder(data: { pinId: string; label: string; reminderAt: number }): void {
    ipcRenderer.send('reminder:set', data);
  },

  cancelReminder(pinId: string): void {
    ipcRenderer.send('reminder:cancel', pinId);
  },

  onReminderData(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { label: string; pinId: string }) =>
      callback(payload);
    ipcRenderer.once('reminder:data', handler);
    return () => ipcRenderer.removeListener('reminder:data', handler);
  },

  onWindowShown(callback) {
    const handler = () => callback();
    ipcRenderer.on('window:shown', handler);
    return () => ipcRenderer.removeListener('window:shown', handler);
  },

  snoozeReminder(data: { pinId: string; label: string; snoozeMs: number }): void {
    ipcRenderer.send('reminder:snooze', data);
  },

  onReminderSnoozed(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { pinId: string; reminderAt: number }) =>
      callback(payload);
    ipcRenderer.on('reminder:snoozed', handler);
    return () => ipcRenderer.removeListener('reminder:snoozed', handler);
  },
};

contextBridge.exposeInMainWorld('pastryAPI', api);
