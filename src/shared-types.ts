export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: number;
  imageDataUrl?: string; // set when a image was copied; text is empty in that case
  htmlContent?: string;  // set when rich-text HTML was available at copy time
  pastedAt?: number;     // UTC ms timestamp of most recent paste
}

export interface PinnedEntry {
  id: string;
  text: string;
  name: string;
  pinnedAt: number;
  imageDataUrl?: string;
  htmlContent?: string;
  tags?: string[];
  reminderAt?: number; // UTC ms timestamp for scheduled reminder
  hidden?: boolean;    // when true, content is masked in the list view
  pastedAt?: number;   // UTC ms timestamp of most recent paste
}

export type ActionKind = 'terminal' | 'url' | 'form' | 'text' | 'app';

export interface UrlListItem {
  id: string;
  url: string;
  label?: string;
  addedAt: number;
}

export interface FormStep {
  value: string;
  then: 'tab' | 'enter' | 'none';
  // When false, skip the "waiting for page to load" popup after this step and
  // continue automatically after a short delay. Defaults to true (show the popup).
  waitForLoad?: boolean;
}

export interface ActionEntry {
  id: string;
  name: string;
  kind: ActionKind;
  createdAt: number;
  tags?: string[];
  lastUsedAt?: number;
  useCount?: number;
  // 'terminal'
  command?: string;
  workingDirectory?: string;
  // 'url' and 'form'
  url?: string;
  // 'form' only
  steps?: FormStep[];
  // 'text' only — the reusable template body, may contain ::placeholder:: tokens
  text?: string;
  // 'text' only — when true, copy the resolved text to the clipboard instead of
  // typing it into the frontmost app. Defaults to false (insert/type).
  copyToClipboard?: boolean;
  // Curated default values for this action's ::placeholder:: tokens, keyed by
  // placeholder name — e.g. { env: ['stage.example.com', 'prod.example.com'] }.
  // Shown ahead of (and separately from) the global cross-action typed-value
  // history in the placeholder-fill dialog.
  paramOptions?: Record<string, string[]>;
  // 'app' only — absolute path to the .app bundle to launch
  appPath?: string;
}
