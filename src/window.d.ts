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
}

export interface PastryStore {
  history: import('./shared-types').ClipboardEntry[];
  pinned: import('./shared-types').PinnedEntry[];
  historySize: number;
}

declare global {
  interface Window {
    pastryAPI: PastryAPI;
  }
}
