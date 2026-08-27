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

export type ActionKind = 'terminal' | 'url' | 'form';

export interface FormStep {
  value: string;
  then: 'tab' | 'enter' | 'none';
}

export interface ActionEntry {
  id: string;
  name: string;
  kind: ActionKind;
  createdAt: number;
  // 'terminal'
  command?: string;
  workingDirectory?: string;
  // 'url' and 'form'
  url?: string;
  // 'form' only
  steps?: FormStep[];
}
