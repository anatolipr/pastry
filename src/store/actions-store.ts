import { Signal, Computed } from 'avosignals';
import type { ActionEntry } from '../shared-types';
import { fuzzyMatch } from './clipboard-store';

export const actions = new Signal<ActionEntry[]>([], 'actions');
export const actionsSearchQuery = new Signal<string>('', 'actionsSearchQuery');
export const activeActionIndex = new Signal<number>(-1, 'activeActionIndex');

/** Kind chosen in the "+ New Action" picker; null means the picker itself is closed. */
export const newActionKind = new Signal<'terminal' | 'url' | 'form' | null>(null, 'newActionKind');

export const isNewActionPickerOpen = new Signal<boolean>(false, 'isNewActionPickerOpen');

/** The action currently being edited (drives the matching kind-specific dialog). */
export const editActionTarget = new Signal<ActionEntry | null>(null, 'editActionTarget');

/** The action currently being considered for deletion (drives delete-action-dialog). */
export const deleteActionTarget = new Signal<ActionEntry | null>(null, 'deleteActionTarget');

export const isDeleteActionDialogOpen = new Computed<boolean>(
  () => deleteActionTarget.get() !== null,
  'isDeleteActionDialogOpen',
);

export const filteredActions = new Computed<ActionEntry[]>(() => {
  const q = actionsSearchQuery.get().toLowerCase().trim();
  const all = actions.get();
  if (!q) return all;
  return all.filter((a) => fuzzyMatch(a.name.toLowerCase(), q));
}, 'filteredActions');

export const activeAction = new Computed<ActionEntry | null>(() => {
  const list = filteredActions.get();
  const idx = activeActionIndex.get();
  return idx >= 0 && idx < list.length ? list[idx] : null;
}, 'activeAction');

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.pastryAPI.saveActions(actions.get());
  }, 150);
}

export async function loadPersistedActions(): Promise<void> {
  const loaded = await window.pastryAPI.loadActions();
  if (loaded) actions.set(loaded);
}

function newId(): string {
  return crypto.randomUUID();
}

export function createAction(entry: Omit<ActionEntry, 'id' | 'createdAt'>): void {
  const full: ActionEntry = { ...entry, id: newId(), createdAt: Date.now() };
  actions.set([full, ...actions.get()]);
  // Clear any stale search text so the newly created action isn't invisible behind
  // a filter left over from finding/picking an unrelated action before "+ New Action".
  actionsSearchQuery.set('');
  activeActionIndex.set(0);
  persist();
}

export function updateAction(id: string, updates: Partial<ActionEntry>): void {
  actions.set(actions.get().map((a) => (a.id === id ? { ...a, ...updates } : a)));
  persist();
}

export function deleteAction(id: string): void {
  actions.set(actions.get().filter((a) => a.id !== id));
  persist();
}
