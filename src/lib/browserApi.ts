import * as core from '../../shared/core';
import { parseBookmarkFile } from '../../shared/bookmarks';
import { isSafeExternalUrl } from '../../shared/url';
import { DEFAULT_PREFERENCES, isInQuietHours, normalizePreferences } from '../../shared/preferences';
import {
  emptyState,
  type AppState,
  type FlowApi,
  type HistoryStatus,
  type Preferences,
} from '../../shared/types';

const DATA_KEY = 'url-flow:data:v1';
const PREFS_KEY = 'url-flow:prefs:v1';
const HISTORY_LIMIT = 40;

const listeners = new Set<(state: AppState) => void>();
const historyListeners = new Set<(status: HistoryStatus) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

interface Snapshot {
  state: AppState;
  label: string;
}

const past: Snapshot[] = [];
const future: Snapshot[] = [];

function readState(): AppState {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return emptyState();
    return core.normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

let state = readState();

function status(): HistoryStatus {
  return { canUndo: past.length > 0, canRedo: future.length > 0 };
}

function emitHistory(): void {
  const current = status();
  historyListeners.forEach((listener) => listener(current));
}

/** Writes without recording history; used by undo and redo themselves. */
function persist(next: AppState): AppState {
  state = next;
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('[storage] could not save', error);
  }
  listeners.forEach((listener) => listener(state));
  return state;
}

function mutate(fn: (current: AppState) => AppState): AppState {
  const next = fn(state);
  if (next === state || JSON.stringify(next) === JSON.stringify(state)) return state;
  past.push({ state, label: 'Change' });
  if (past.length > HISTORY_LIMIT) past.shift();
  future.length = 0;
  emitHistory();
  return persist(next);
}

function tick(): void {
  if (isInQuietHours(new Date(), prefs.quietHoursStart, prefs.quietHoursEnd)) return;
  const due = core.dueReminders(state);
  if (due.length === 0) return;
  let next = state;
  for (const reminder of due) {
    next = core.markReminderNotified(next, reminder.id);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Reminder · URL Flow', { body: reminder.text, silent: !prefs.reminderSound });
      }
    } catch {
      /* ignore */
    }
  }
  persist(next);
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(tick, 15_000);
}

function readPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return normalizePreferences(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizePreferences(undefined);
  }
}

let prefs = readPrefs();

export const browserApi: FlowApi = {
  load: async () => {
    ensureTimer();
    return state;
  },
  getPreferences: async () => prefs,
  setPreference: async (key, value) => {
    if (!Object.hasOwn(DEFAULT_PREFERENCES, key) || typeof value !== typeof DEFAULT_PREFERENCES[key]) {
      throw new Error('Invalid preference value.');
    }
    const next = normalizePreferences({ ...prefs, [key]: value });
    if (key === 'captureShortcut' && next.captureShortcut !== String(value).trim()) {
      throw new Error('Enter a valid capture shortcut.');
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    prefs = next;
    return prefs;
  },
  create: async (draft) => mutate((current) => core.createItem(current, draft).state),
  update: async (id, patch) => mutate((current) => core.updateItem(current, id, patch)),
  remove: async (id) => mutate((current) => core.removeItem(current, id)),
  archive: async (id) => mutate((current) => core.setArchived(current, id, true)),
  restore: async (id) => mutate((current) => core.setArchived(current, id, false)),
  markReviewed: async (id) => mutate((current) => core.markReviewed(current, id)),
  merge: async (primaryId, otherId, choices) =>
    mutate((current) => core.mergeItems(current, primaryId, otherId, choices)),
  mergeMany: async (primaryId, otherIds, choices) =>
    mutate((current) => core.mergeMany(current, primaryId, otherIds, choices)),
  toggleStep: async (planId, stepId) => mutate((current) => core.toggleStep(current, planId, stepId)),
  setReminder: async (itemId, remindAt, text, repeat) =>
    mutate((current) => core.setReminder(current, itemId, remindAt, text, repeat)),
  snoozeReminder: async (id, minutes) => mutate((current) => core.snoozeReminder(current, id, minutes)),
  dismissReminder: async (id) => mutate((current) => core.removeReminder(current, id)),
  removeReminder: async (id) => mutate((current) => core.removeReminder(current, id)),
  ignoreMatch: async (key) => mutate((current) => core.ignoreMatch(current, key)),
  unignoreMatch: async (key) => mutate((current) => core.unignoreMatch(current, key)),
  bulkTriage: async (ids, action) => {
    const current = state;
    const saved = mutate((current) => core.bulkTriageLinks(current, ids, action));
    return saved === current ? null : saved;
  },
  openLinks: async (ids) => {
    const selected = new Set(ids);
    const opened = new Set<string>();
    for (const item of state.items) {
      if (item.kind !== 'link' || item.archivedAt || !selected.has(item.id)) continue;
      try {
        const protocol = new URL(item.url).protocol;
        if (protocol !== 'http:' && protocol !== 'https:') continue;
        window.open(item.url, '_blank', 'noopener,noreferrer');
        opened.add(item.id);
      } catch {
        // Continue opening the selection after an individual browser error.
      }
    }
    if (opened.size === 0) return null;
    const lastOpenedAt = new Date().toISOString();
    const current = state;
    const saved = mutate((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.kind === 'link' && !entry.archivedAt && opened.has(entry.id) ? { ...entry, readingState: 'read', lastOpenedAt } : entry,
      ),
    }));
    return saved === current ? null : saved;
  },
  openLink: async (id) => {
    const item = state.items.find((entry) => entry.id === id && entry.kind === 'link');
    if (!item || item.kind !== 'link' || !isSafeExternalUrl(item.url)) return state;
    window.open(item.url, '_blank', 'noopener,noreferrer');
    const lastOpenedAt = new Date().toISOString();
    return mutate((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === id && entry.kind === 'link' ? { ...entry, readingState: 'read', lastOpenedAt } : entry,
      ),
    }));
  },
  copyText: async (text) => {
    await navigator.clipboard.writeText(text);
  },
  readClipboard: async () => navigator.clipboard.readText(),
  fetchTitle: async () => null,
  fetchMetadata: async () => null,
  readFavicon: async () => null,
  exportData: async () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `url-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return link.download;
  },
  importData: async () => {
    return new Promise<AppState | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        try {
          const parsed = JSON.parse(await file.text());
          resolve(mutate(() => core.normalizeState(parsed)));
        } catch (error) {
          reject(error);
        }
      };
      input.click();
    });
  },
  revealDataFile: async () => undefined,
  testNotification: async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('URL Flow', { body: 'Reminders will appear like this.', silent: !prefs.reminderSound });
    }
  },
  undo: async () => {
    const entry = past.pop();
    if (!entry) return null;
    future.push({ state, label: entry.label });
    emitHistory();
    return persist(entry.state);
  },
  redo: async () => {
    const entry = future.pop();
    if (!entry) return null;
    past.push({ state, label: entry.label });
    emitHistory();
    return persist(entry.state);
  },
  historyStatus: async () => status(),
  pickBookmarks: async () => {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.html,.htm,text/html';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        try {
          resolve({ fileName: file.name, entries: parseBookmarkFile(await file.text()) });
        } catch (error) {
          reject(error);
        }
      };
      input.click();
    });
  },
  importBookmarks: async (entries, tagFolders) => {
    const result = core.importBookmarks(state, entries, tagFolders);
    if (result.added === 0) return { state, added: 0, skipped: result.skipped };
    const saved = mutate(() => result.state);
    return { state: saved, added: result.added, skipped: result.skipped };
  },
  listBackups: async () => [],
  restoreBackup: async () => {
    throw new Error('Automatic backups are available in the desktop app.');
  },
  backupNow: async () => null,
  onState: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  onHistory: (callback) => {
    historyListeners.add(callback);
    return () => historyListeners.delete(callback);
  },
  onFocusItem: () => () => undefined,
  onCapture: () => () => undefined,
};
