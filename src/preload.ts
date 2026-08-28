import { contextBridge, ipcRenderer } from 'electron';
import type { PastryAPI } from './window';

const api: PastryAPI = {
  setMaxImageSizeMb(mb: number): void {
    ipcRenderer.send('settings:max-image-size-mb', mb);
  },

  readClipboardText(): Promise<string> {
    return ipcRenderer.invoke('clipboard:read-text');
  },

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

  pasteItemKeepOpen(payload): void {
    ipcRenderer.send('clipboard:paste-keep-open', payload);
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

  registerActionsShortcut(shortcut: string): Promise<boolean> {
    return ipcRenderer.invoke('actions-shortcut:register', shortcut);
  },

  setDoubleTapActionsEnabled(enabled: boolean): void {
    ipcRenderer.send('settings:double-tap-actions-enabled', enabled);
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

  notifyHistoryFull(historySize: number): void {
    ipcRenderer.send('history:full', historySize);
  },

  onHistoryFullData(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { historySize: number }) =>
      callback(payload);
    ipcRenderer.once('history-full:data', handler);
    return () => ipcRenderer.removeListener('history-full:data', handler);
  },

  onReminderSnoozed(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: { pinId: string; reminderAt: number }) =>
      callback(payload);
    ipcRenderer.on('reminder:snoozed', handler);
    return () => ipcRenderer.removeListener('reminder:snoozed', handler);
  },

  loadActions() {
    return ipcRenderer.invoke('actions:load');
  },

  saveActions(actionsData) {
    ipcRenderer.send('actions:save', actionsData);
  },

  loadPlaceholderHistory() {
    return ipcRenderer.invoke('placeholder-history:load');
  },

  savePlaceholderHistory(history) {
    ipcRenderer.send('placeholder-history:save', history);
  },

  loadUrlScratchpad() {
    return ipcRenderer.invoke('url-scratchpad:load');
  },

  saveUrlScratchpad(items) {
    ipcRenderer.send('url-scratchpad:save', items);
  },

  runTerminalAction(payload) {
    ipcRenderer.send('action:run-terminal', payload);
  },

  runUrlAction(payload) {
    ipcRenderer.send('action:run-url', payload);
  },

  runAppAction(payload) {
    ipcRenderer.send('action:run-app', payload);
  },

  pickApp() {
    return ipcRenderer.invoke('action:pick-app');
  },

  runFormAction(payload) {
    ipcRenderer.send('action:run-form', payload);
  },

  runTextAction(payload) {
    ipcRenderer.send('action:run-text', payload);
  },

  completeFormAction() {
    ipcRenderer.send('action:form-complete');
  },

  cancelFormAction() {
    ipcRenderer.send('action:form-cancel');
  },

  hideActionsWindow() {
    ipcRenderer.send('actions-window:hide');
  },

  onActionsWindowShown(callback) {
    const handler = () => callback();
    ipcRenderer.on('actions-window:shown', handler);
    return () => ipcRenderer.removeListener('actions-window:shown', handler);
  },
};

contextBridge.exposeInMainWorld('pastryAPI', api);
