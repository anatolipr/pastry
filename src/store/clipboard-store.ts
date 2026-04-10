import { Signal, Computed } from 'avosignals';
import type { ClipboardEntry, PinnedEntry } from '../shared-types';
import { DEFAULT_HISTORY_SIZE } from '../constants';

export type ActiveItem =
  | { kind: 'history'; entry: ClipboardEntry }
  | { kind: 'pinned'; entry: PinnedEntry };

// ---------------------------------------------------------------------------
// State signals
// ---------------------------------------------------------------------------

export const clipboardHistory = new Signal<ClipboardEntry[]>([], 'clipboardHistory');
export const pinnedItems = new Signal<PinnedEntry[]>([], 'pinnedItems');
export const historySize = new Signal<number>(DEFAULT_HISTORY_SIZE, 'historySize');
export const searchQuery = new Signal<string>('', 'searchQuery');
export const activeIndex = new Signal<number>(-1, 'activeIndex');

/** The entry currently being considered for pinning (drives pin-dialog). */
export const pinTarget = new Signal<ClipboardEntry | null>(null, 'pinTarget');

/** The entry currently being considered for unpinning (drives unpin-dialog). */
export const unpinTarget = new Signal<PinnedEntry | null>(null, 'unpinTarget');

/** The pinned entry currently being edited (drives edit-dialog). */
export const editTarget = new Signal<PinnedEntry | null>(null, 'editTarget');

/** The history entry currently being considered for deletion (drives delete-dialog). */
export const deleteTarget = new Signal<ClipboardEntry | null>(null, 'deleteTarget');

// ---------------------------------------------------------------------------
// Derived / computed
// ---------------------------------------------------------------------------

export const isPinDialogOpen = new Computed<boolean>(
  () => pinTarget.get() !== null,
  'isPinDialogOpen',
);

export const isUnpinDialogOpen = new Computed<boolean>(
  () => unpinTarget.get() !== null,
  'isUnpinDialogOpen',
);

export const isEditDialogOpen = new Computed<boolean>(
  () => editTarget.get() !== null,
  'isEditDialogOpen',
);

export const isDeleteDialogOpen = new Computed<boolean>(
  () => deleteTarget.get() !== null,
  'isDeleteDialogOpen',
);

export const filteredHistory = new Computed<ClipboardEntry[]>(() => {
  const q = searchQuery.get().toLowerCase().trim();
  if (!q) return clipboardHistory.get();
  return clipboardHistory.get().filter((e) =>
    e.imageDataUrl ? false : e.text.toLowerCase().includes(q),
  );
}, 'filteredHistory');

export const filteredPinned = new Computed<PinnedEntry[]>(() => {
  const q = searchQuery.get().toLowerCase().trim();
  if (!q) return pinnedItems.get();
  return pinnedItems.get().filter(
    (e) => e.text.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
  );
}, 'filteredPinned');

/** Flat combined list for keyboard navigation: history first, then pinned. */
export const combinedItems = new Computed<ActiveItem[]>(() => {
  const h: ActiveItem[] = filteredHistory.get().map((entry) => ({ kind: 'history', entry }));
  const p: ActiveItem[] = filteredPinned.get().map((entry) => ({ kind: 'pinned', entry }));
  return [...h, ...p];
}, 'combinedItems');

export const activeItem = new Computed<ActiveItem | null>(() => {
  const idx = activeIndex.get();
  const items = combinedItems.get();
  if (idx < 0 || idx >= items.length) return null;
  return items[idx];
}, 'activeItem');

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Prepend a new text to clipboard history.
 * - Deduplicates: if the same text exists already it moves to the top.
 * - Trims the list to historySize entries.
 */
export function addToHistory(payload: { text: string; imageDataUrl?: string }): void {
  const { text, imageDataUrl } = payload;
  if (!imageDataUrl && !text.trim()) return;
  const current = clipboardHistory.get();
  // Dedup on text (for text entries) or imageDataUrl signature (for images)
  const filtered = imageDataUrl
    ? current.filter((e) => e.imageDataUrl !== imageDataUrl)
    : current.filter((e) => e.text !== text);
  const entry: ClipboardEntry = {
    id: crypto.randomUUID(),
    text,
    timestamp: Date.now(),
    imageDataUrl,
  };
  const next = [entry, ...filtered].slice(0, historySize.get());
  clipboardHistory.set(next);
  persistStore();
}

/**
 * Move the current pinTarget to pinnedItems with the given name,
 * then clear pinTarget.
 */
export function pinItem(entry: ClipboardEntry, name: string): void {
  const trimmedName = name.trim() || (entry.imageDataUrl ? 'Image' : entry.text.slice(0, 30));
  const pinned: PinnedEntry = {
    id: crypto.randomUUID(),
    text: entry.text,
    name: trimmedName,
    pinnedAt: Date.now(),
    imageDataUrl: entry.imageDataUrl,
  };
  pinnedItems.update((prev) => [pinned, ...prev]);
  pinTarget.set(null);
  persistStore();
}

/**
 * Remove a pinned entry by id and clear unpinTarget.
 */
export function unpinItem(id: string): void {
  pinnedItems.update((prev) => prev.filter((e) => e.id !== id));
  unpinTarget.set(null);
  persistStore();
}

/**
 * Update an existing pinned entry's name and/or text.
 */
export function updatePinnedItem(id: string, name: string, text: string): void {
  pinnedItems.update((prev) =>
    prev.map((e) => (e.id === id ? { ...e, name: name.trim() || e.name, text: text.trim() || e.text } : e)),
  );
  editTarget.set(null);
  persistStore();
}

export function setPinTarget(entry: ClipboardEntry | null): void {
  pinTarget.set(entry);
}

export function setUnpinTarget(entry: PinnedEntry | null): void {
  unpinTarget.set(entry);
}

export function setEditTarget(entry: PinnedEntry | null): void {
  editTarget.set(entry);
}

export function setDeleteTarget(entry: ClipboardEntry | null): void {
  deleteTarget.set(entry);
}

export function deleteHistoryItem(id: string): void {
  clipboardHistory.update((prev) => prev.filter((e) => e.id !== id));
  deleteTarget.set(null);
  persistStore();
}

export function moveHistoryItemToTop(id: string): void {
  clipboardHistory.update((prev) => {
    const idx = prev.findIndex((e) => e.id === id);
    if (idx <= 0) return prev; // already on top or not found
    const item = prev[idx];
    return [item, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
  });
  persistStore();
}

export function copyHistoryItemToTop(id: string): void {
  clipboardHistory.update((prev) => {
    const original = prev.find((e) => e.id === id);
    if (!original) return prev;
    const fresh: ClipboardEntry = {
      ...original,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    return [fresh, ...prev].slice(0, historySize.get());
  });
  persistStore();
}

export function setHistorySize(size: number): void {
  const clamped = Math.max(1, Math.min(200, size));
  historySize.set(clamped);
  // Trim existing history if new size is smaller.
  clipboardHistory.update((prev) => prev.slice(0, clamped));
  persistStore();
}

export function clearHistory(): void {
  clipboardHistory.set([]);
  persistStore();
}

export function setActiveIndex(idx: number): void {
  const len = combinedItems.get().length;
  if (len === 0) { activeIndex.set(-1); return; }
  activeIndex.set(Math.max(-1, Math.min(len - 1, idx)));
}

export function moveActiveIndex(delta: number): void {
  const len = combinedItems.get().length;
  if (len === 0) return;
  const current = activeIndex.get();
  // Start from 0 if nothing selected; wrap around at ends.
  const next = current < 0
    ? (delta > 0 ? 0 : len - 1)
    : (current + delta + len) % len;
  activeIndex.set(next);
}

/**
 * Move ↑↓ within the active panel only, wrapping within that panel.
 * When search is active there is only one combined list — behaves like moveActiveIndex.
 */
export function moveActiveIndexInPanel(delta: number): void {
  const hLen = filteredHistory.get().length;
  const pLen = filteredPinned.get().length;
  const total = hLen + pLen;
  if (total === 0) return;

  const current = activeIndex.get();
  const isSearching = searchQuery.get().trim().length > 0;

  if (isSearching) {
    // Single flat list — wrap across everything.
    const next = current < 0
      ? (delta > 0 ? 0 : total - 1)
      : (current + delta + total) % total;
    activeIndex.set(next);
    return;
  }

  // Determine which panel the current selection is in.
  const inPinned = current >= hLen && current < total;

  if (!inPinned) {
    // Currently in history (or nothing selected).
    if (hLen === 0) return;
    if (current < 0) {
      activeIndex.set(delta > 0 ? 0 : hLen - 1);
    } else {
      activeIndex.set((current + delta + hLen) % hLen);
    }
  } else {
    // Currently in pinned.
    if (pLen === 0) return;
    const localIdx = current - hLen;
    const nextLocal = (localIdx + delta + pLen) % pLen;
    activeIndex.set(hLen + nextLocal);
  }
}

/**
 * Move ←→ between history and pinned panels.
 * direction: 1 = history→pinned, -1 = pinned→history.
 */
export function moveActivePanel(direction: number): void {
  const hLen = filteredHistory.get().length;
  const pLen = filteredPinned.get().length;
  const current = activeIndex.get();
  const inPinned = current >= hLen && current < hLen + pLen;

  if (direction > 0 && !inPinned) {
    // history → pinned: jump to first pinned item
    if (pLen === 0) return;
    activeIndex.set(hLen);
  } else if (direction < 0 && inPinned) {
    // pinned → history: jump to first history item
    if (hLen === 0) return;
    activeIndex.set(0);
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

let _persistTimeout: ReturnType<typeof setTimeout> | null = null;

/** Debounced save — batches rapid changes into one write. */
export function persistStore(): void {
  if (_persistTimeout) clearTimeout(_persistTimeout);
  _persistTimeout = setTimeout(() => {
    window.pastryAPI.saveStore({
      history: clipboardHistory.get(),
      pinned: pinnedItems.get(),
      historySize: historySize.get(),
    });
  }, 400);
}

/** Load persisted state from main process and hydrate signals. */
export async function loadPersistedStore(): Promise<void> {
  const data = await window.pastryAPI.loadStore();
  if (!data) return;
  if (Array.isArray(data.history)) clipboardHistory.set(data.history);
  if (Array.isArray(data.pinned)) pinnedItems.set(data.pinned);
  if (typeof data.historySize === 'number') historySize.set(data.historySize);
}

