export interface ClipboardPayload {
  text: string;
  imageDataUrl?: string;
  htmlContent?: string;
}

export interface PastryAPI {
  writeClipboard: (text: string) => void;
  writeRichClipboard: (payload: { text: string; htmlContent: string }) => void;
  writeImageClipboard: (dataUrl: string) => void;
  pasteItem: (payload: ClipboardPayload) => void;
  onClipboardChange: (callback: (payload: ClipboardPayload) => void) => () => void;
  loadStore: () => Promise<PastryStore | null>;
  saveStore: (data: PastryStore) => void;
  hideWindow: () => void;
  registerShortcut: (shortcut: string) => Promise<boolean>;
  exportPins: (data: unknown) => Promise<boolean>;
  importPins: () => Promise<unknown>;
  notifyHistoryDeleted: (payload: ClipboardPayload) => void;
  openImagePreview: (dataUrl: string, title: string) => void;
  onImagePreviewData: (callback: (payload: { dataUrl: string; title: string }) => void) => () => void;
  setReminder: (data: { pinId: string; label: string; reminderAt: number }) => void;
  cancelReminder: (pinId: string) => void;
  onReminderData: (callback: (payload: { label: string; pinId: string }) => void) => () => void;
  snoozeReminder: (data: { pinId: string; label: string; snoozeMs: number }) => void;
  onReminderSnoozed: (callback: (payload: { pinId: string; reminderAt: number }) => void) => () => void;
}

export interface PastryStore {
  history: import('./shared-types').ClipboardEntry[];
  pinned: import('./shared-types').PinnedEntry[];
  historySize: number;
  shortcut?: string;
  themeMode?: string;
}

declare global {
  interface Window {
    pastryAPI: PastryAPI;
  }
}
