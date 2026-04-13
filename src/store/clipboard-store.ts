import { Signal, Computed } from 'avosignals';
import type { ClipboardEntry, PinnedEntry } from '../shared-types';
import { DEFAULT_HISTORY_SIZE, GLOBAL_SHORTCUT } from '../constants';

export type ActiveItem =
  | { kind: 'history'; entry: ClipboardEntry }
  | { kind: 'pinned'; entry: PinnedEntry };

// ---------------------------------------------------------------------------
// State signals
// ---------------------------------------------------------------------------

export const clipboardHistory = new Signal<ClipboardEntry[]>([], 'clipboardHistory');
export const pinnedItems = new Signal<PinnedEntry[]>([], 'pinnedItems');
export const historySize = new Signal<number>(DEFAULT_HISTORY_SIZE, 'historySize');
export const shortcut = new Signal<string>(GLOBAL_SHORTCUT, 'shortcut');
export const searchQuery = new Signal<string>('', 'searchQuery');
export const tagFilter = new Signal<string[]>([], 'tagFilter');
export const activeIndex = new Signal<number>(-1, 'activeIndex');
export const isSettingsOpen = new Signal<boolean>(false, 'isSettingsOpen');

export type ThemeMode = 'dark' | 'light' | 'auto';
export const themeMode = new Signal<ThemeMode>('auto', 'themeMode');

/** The entry currently being considered for pinning (drives pin-dialog). */
export const pinTarget = new Signal<ClipboardEntry | null>(null, 'pinTarget');

/** The entry currently being considered for unpinning (drives unpin-dialog). */
export const unpinTarget = new Signal<PinnedEntry | null>(null, 'unpinTarget');

/** The pinned entry currently being edited (drives edit-dialog). */
export const editTarget = new Signal<PinnedEntry | null>(null, 'editTarget');

/** The history entry currently being considered for deletion (drives delete-dialog). */
export const deleteTarget = new Signal<ClipboardEntry | null>(null, 'deleteTarget');

/** Whether the "new pin" dialog (create from scratch) is open. */
export const isNewPinOpen = new Signal<boolean>(false, 'isNewPinOpen');

/** The pinned entry whose reminder is being configured (drives reminder-dialog). */
export const reminderTarget = new Signal<PinnedEntry | null>(null, 'reminderTarget');

/** Callback-mode reminder dialog — used when no pin exists yet (e.g. new-pin flow). */
export const reminderCallbackTarget = new Signal<{
  label: string;
  initial?: number;
  callback: (ts: number | null) => void;
} | null>(null, 'reminderCallbackTarget');

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

export const isReminderDialogOpen = new Computed<boolean>(
  () => reminderTarget.get() !== null || reminderCallbackTarget.get() !== null,
  'isReminderDialogOpen',
);

export const filteredHistory = new Computed<ClipboardEntry[]>(() => {
  const q = searchQuery.get().toLowerCase().trim();
  if (!q) return clipboardHistory.get();
  return clipboardHistory.get().filter((e) =>
    e.imageDataUrl ? false : e.text.toLowerCase().includes(q),
  );
}, 'filteredHistory');

export const allTags = new Computed<string[]>(() => {
  const tags = new Set<string>();
  for (const e of pinnedItems.get()) {
    for (const t of (e.tags ?? [])) tags.add(t);
  }
  return [...tags].sort();
}, 'allTags');

export const filteredPinned = new Computed<PinnedEntry[]>(() => {
  const q = searchQuery.get().toLowerCase().trim();
  const tf = tagFilter.get();
  let items = pinnedItems.get();
  if (q) {
    items = items.filter(
      (e) => e.text.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
    );
  }
  if (tf.length > 0) {
    items = items.filter((e) => tf.every((t) => (e.tags ?? []).includes(t)));
  }
  return items;
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
export function addToHistory(payload: { text: string; imageDataUrl?: string; htmlContent?: string }): void {
  const { text, imageDataUrl, htmlContent } = payload;
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
    htmlContent,
  };
  const next = [entry, ...filtered].slice(0, historySize.get());
  clipboardHistory.set(next);
  persistStore();
}

/**
 * Move the current pinTarget to pinnedItems with the given name,
 * then clear pinTarget.
 */
export function pinItem(entry: ClipboardEntry, name: string, tags: string[] = []): void {
  const trimmedName = name.trim() || (entry.imageDataUrl ? 'Image' : entry.text.slice(0, 30));
  const pinned: PinnedEntry = {
    id: crypto.randomUUID(),
    text: entry.text,
    name: trimmedName,
    pinnedAt: Date.now(),
    imageDataUrl: entry.imageDataUrl,
    htmlContent: entry.htmlContent,
    tags: tags.length > 0 ? tags : undefined,
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
  // Remove any active tag filters that no longer exist in remaining pins
  const remainingTags = new Set<string>();
  for (const e of pinnedItems.get()) {
    for (const t of (e.tags ?? [])) remainingTags.add(t);
  }
  const currentFilter = tagFilter.get();
  const validFilter = currentFilter.filter((t) => remainingTags.has(t));
  if (validFilter.length !== currentFilter.length) {
    tagFilter.set(validFilter);
  }
  persistStore();
}

/**
 * Update an existing pinned entry's name and/or text.
 */
export function updatePinnedItem(id: string, name: string, text: string, tags?: string[], htmlContent?: string): void {
  pinnedItems.update((prev) =>
    prev.map((e) => (e.id === id ? {
      ...e,
      name: name.trim() || e.name,
      text: text.trim() || e.text,
      htmlContent: htmlContent !== undefined ? htmlContent : e.htmlContent,
      tags: tags !== undefined ? (tags.length > 0 ? tags : undefined) : e.tags,
    } : e)),
  );
  editTarget.set(null);
  persistStore();
}

export function setTagFilter(tags: string[]): void {
  tagFilter.set(tags);
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

export function setNewPinOpen(open: boolean): void {
  isNewPinOpen.set(open);
}

export function openReminderDialog(entry: PinnedEntry): void {
  reminderTarget.set(entry);
}

export function openReminderDialogCallback(
  label: string,
  initial: number | undefined,
  callback: (ts: number | null) => void,
): void {
  reminderCallbackTarget.set({ label, initial, callback });
}

export function closeReminderDialog(): void {
  reminderTarget.set(null);
  reminderCallbackTarget.set(null);
}

export function setReminderOnPin(pinId: string, reminderAtMs: number): void {
  const pin = pinnedItems.get().find((p) => p.id === pinId);
  if (!pin) return;
  pinnedItems.update((prev) =>
    prev.map((p) => (p.id === pinId ? { ...p, reminderAt: reminderAtMs } : p)),
  );
  window.pastryAPI.setReminder({ pinId, label: pin.name, reminderAt: reminderAtMs });
  persistStore();
}

export function clearReminderOnPin(pinId: string): void {
  pinnedItems.update((prev) =>
    prev.map((p) => (p.id === pinId ? { ...p, reminderAt: undefined } : p)),
  );
  window.pastryAPI.cancelReminder(pinId);
  persistStore();
}

/**
 * Directly create a new pinned entry from scratch (not from clipboard history).
 */
export function pinNewItem(text: string, name: string, tags: string[] = []): string {
  const trimmedText = text.trim();
  if (!trimmedText) return '';
  const trimmedName = name.trim() || trimmedText.slice(0, 30);
  const pinned: PinnedEntry = {
    id: crypto.randomUUID(),
    text: trimmedText,
    name: trimmedName,
    pinnedAt: Date.now(),
    tags: tags.length > 0 ? tags : undefined,
  };
  pinnedItems.update((prev) => [pinned, ...prev]);
  isNewPinOpen.set(false);
  persistStore();
  return pinned.id;
}

export function deleteHistoryItem(id: string): void {
  const history = clipboardHistory.get();
  const entry = history.find((e) => e.id === id);
  const isCurrentClipboard = history[0]?.id === id;
  clipboardHistory.update((prev) => prev.filter((e) => e.id !== id));
  deleteTarget.set(null);
  if (entry) {
    window.pastryAPI.notifyHistoryDeleted({ text: entry.text ?? '', imageDataUrl: entry.imageDataUrl });
  }
  // If we deleted the item that is currently in the OS clipboard, clear the
  // clipboard so the watcher doesn't immediately re-add it.
  // If we deleted the item currently in the OS clipboard, clear the clipboard
  // so the watcher doesn't immediately re-add it on the next poll.
  if (isCurrentClipboard) {
    window.pastryAPI.writeClipboard('');
  }
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

export function setThemeMode(mode: ThemeMode): void {
  themeMode.set(mode);
  persistStore();
}

export function setShortcut(s: string): void {
  shortcut.set(s);
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

export interface PastryExport {
  version: 1;
  pins: PinnedEntry[];
}

export async function exportSelectedPins(ids: string[]): Promise<boolean> {
  const visible = filteredPinned.get();
  const selected = visible.filter((p) => ids.includes(p.id));
  const payload: PastryExport = { version: 1, pins: selected };
  return window.pastryAPI.exportPins(payload);
}

export async function importPins(): Promise<void> {
  const raw = await window.pastryAPI.importPins();
  if (!raw || typeof raw !== 'object') return;
  const data = raw as PastryExport;
  if (!Array.isArray(data.pins)) return;
  const existing = pinnedItems.get();
  const existingIds = new Set(existing.map((p) => p.id));
  const toAdd = data.pins
    .filter((p) => p && typeof p.id === 'string' && !existingIds.has(p.id))
    .map((p): PinnedEntry => ({
      id: p.id,
      text: p.text ?? '',
      name: p.name ?? 'Imported',
      pinnedAt: p.pinnedAt ?? Date.now(),
      imageDataUrl: p.imageDataUrl,
      tags: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : undefined,
    }));
  if (toAdd.length === 0) return;
  pinnedItems.set([...existing, ...toAdd]);
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
      shortcut: shortcut.get(),
      themeMode: themeMode.get(),
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
  if (typeof data.shortcut === 'string' && data.shortcut) shortcut.set(data.shortcut);
  if (data.themeMode === 'dark' || data.themeMode === 'light' || data.themeMode === 'auto') themeMode.set(data.themeMode);
  // Re-register any future reminders so timers fire even after a restart.
  const now = Date.now();
  for (const pin of pinnedItems.get()) {
    if (typeof pin.reminderAt === 'number' && pin.reminderAt > now) {
      window.pastryAPI.setReminder({ pinId: pin.id, label: pin.name, reminderAt: pin.reminderAt });
    }
  }
  // Keep pinnedItems in sync when a snooze is confirmed from a popup window.
  window.pastryAPI.onReminderSnoozed(({ pinId, reminderAt }) => {
    pinnedItems.update((prev) =>
      prev.map((p) => (p.id === pinId ? { ...p, reminderAt } : p)),
    );
    persistStore();
  });
}

