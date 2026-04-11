export interface ClipboardPayload {
  text: string;
  imageDataUrl?: string;
}

export interface PastryAPI {
  writeClipboard: (text: string) => void;
  writeImageClipboard: (dataUrl: string) => void;
  pasteItem: (payload: ClipboardPayload) => void;
  onClipboardChange: (callback: (payload: ClipboardPayload) => void) => () => void;
  loadStore: () => Promise<PastryStore | null>;
  saveStore: (data: PastryStore) => void;
  hideWindow: () => void;
  registerShortcut: (shortcut: string) => Promise<boolean>;
  exportPins: (data: unknown) => Promise<boolean>;
  importPins: () => Promise<unknown>;
}

export interface PastryStore {
  history: import('./shared-types').ClipboardEntry[];
  pinned: import('./shared-types').PinnedEntry[];
  historySize: number;
  shortcut?: string;
}

declare global {
  interface Window {
    pastryAPI: PastryAPI;
  }
}
