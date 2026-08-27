export interface ClipboardPayload {
  text: string;
  imageDataUrl?: string;
  htmlContent?: string;
}

export interface PastryAPI {
  setMaxImageSizeMb: (mb: number) => void;
  writeClipboard: (text: string) => void;
  writeRichClipboard: (payload: { text: string; htmlContent: string }) => void;
  writeImageClipboard: (dataUrl: string) => void;
  pasteItem: (payload: ClipboardPayload) => void;
  pasteItemKeepOpen: (payload: ClipboardPayload) => void;
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
  onWindowShown: (callback: () => void) => () => void;
  notifyHistoryFull: (historySize: number) => void;
  onHistoryFullData: (callback: (payload: { historySize: number }) => void) => () => void;
  loadActions: () => Promise<import('./shared-types').ActionEntry[]>;
  saveActions: (actions: import('./shared-types').ActionEntry[]) => void;
  runTerminalAction: (payload: { command: string; workingDirectory: string }) => void;
  runUrlAction: (payload: { url: string }) => void;
  runFormAction: (payload: { url: string; steps: import('./shared-types').FormStep[] }) => void;
  hideActionsWindow: () => void;
  onActionsWindowShown: (callback: () => void) => () => void;
  completeFormAction: () => void;
  cancelFormAction: () => void;
}

export interface PastryStore {
  history: import('./shared-types').ClipboardEntry[];
  pinned: import('./shared-types').PinnedEntry[];
  historySize: number;
  maxImageSizeMb?: number;
  shortcut?: string;
  sequentialPasteShortcut?: string;
  themeMode?: string;
  actions?: import('./shared-types').ActionEntry[];
}

declare global {
  interface Window {
    pastryAPI: PastryAPI;
  }
}
