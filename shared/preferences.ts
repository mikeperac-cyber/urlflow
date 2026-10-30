import type { Preferences } from './types';

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  closeToTray: true,
  captureShortcut: 'CommandOrControl+Shift+Space',
  reminderSound: true,
  quietHoursStart: '',
  quietHoursEnd: '',
};

function isQuietTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Migrates legacy preferences without trusting values loaded from disk or local storage. */
export function normalizePreferences(raw: unknown): Preferences {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const shortcut = typeof value.captureShortcut === 'string' ? value.captureShortcut.trim() : '';
  return {
    closeToTray: typeof value.closeToTray === 'boolean' ? value.closeToTray : DEFAULT_PREFERENCES.closeToTray,
    captureShortcut: shortcut.length <= 100 && /^[^\s\u0000-\u001f\u007f]+$/.test(shortcut)
      ? shortcut : DEFAULT_PREFERENCES.captureShortcut,
    reminderSound: typeof value.reminderSound === 'boolean' ? value.reminderSound : DEFAULT_PREFERENCES.reminderSound,
    quietHoursStart: isQuietTime(value.quietHoursStart) ? value.quietHoursStart : '',
    quietHoursEnd: isQuietTime(value.quietHoursEnd) ? value.quietHoursEnd : '',
  };
}

/** Uses local wall-clock time. The start is inclusive and the end is exclusive. */
export function isInQuietHours(now: Date, start: string, end: string): boolean {
  if (!Number.isFinite(now.getTime()) || !isQuietTime(start) || !isQuietTime(end) || start === end) return false;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutes(start);
  const until = minutes(end);
  return from < until ? current >= from && current < until : current >= from || current < until;
}
