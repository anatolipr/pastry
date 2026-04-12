export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: number;
  imageDataUrl?: string; // set when a image was copied; text is empty in that case
  htmlContent?: string;  // set when rich-text HTML was available at copy time
}

export interface PinnedEntry {
  id: string;
  text: string;
  name: string;
  pinnedAt: number;
  imageDataUrl?: string;
  htmlContent?: string;
}
