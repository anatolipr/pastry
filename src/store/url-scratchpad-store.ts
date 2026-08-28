import { Signal } from 'avosignals';
import type { UrlListItem } from '../shared-types';

/** A small standalone scratch tool for temporary links (Jenkins builds, Jira tickets,
 * anything you'll only care about for a few minutes) — deliberately not an action
 * type, so it doesn't clutter the actions list or need naming/tags/kind-picking. */
export const urlScratchpadItems = new Signal<UrlListItem[]>([], 'urlScratchpadItems');

export const isUrlScratchpadOpen = new Signal<boolean>(false, 'isUrlScratchpadOpen');

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.pastryAPI.saveUrlScratchpad(urlScratchpadItems.get());
  }, 150);
}

export async function loadPersistedUrlScratchpad(): Promise<void> {
  const loaded = await window.pastryAPI.loadUrlScratchpad();
  if (loaded) urlScratchpadItems.set(loaded);
}

function newId(): string {
  return crypto.randomUUID();
}

export function addUrlScratchpadItem(item: { url: string; label?: string }): void {
  const newItem: UrlListItem = { id: newId(), url: item.url, label: item.label, addedAt: Date.now() };
  urlScratchpadItems.set([newItem, ...urlScratchpadItems.get()]);
  persist();
}

export function removeUrlScratchpadItem(itemId: string): void {
  urlScratchpadItems.set(urlScratchpadItems.get().filter((it) => it.id !== itemId));
  persist();
}

export function clearUrlScratchpadItems(): void {
  urlScratchpadItems.set([]);
  persist();
}

/** Grabs the current system clipboard text and drops it straight into the scratchpad
 * as a new item — no dialog, for the fastest possible "copy a link, stash it" loop.
 * No-ops on an empty clipboard. */
export async function pasteUrlScratch(): Promise<boolean> {
  const url = (await window.pastryAPI.readClipboardText()).trim();
  if (!url) return false;
  addUrlScratchpadItem({ url });
  return true;
}
