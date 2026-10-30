import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowApi } from '../../shared/types';

let api: FlowApi;
let notifications: Record<string, unknown>[];
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); notifications = [];
  vi.stubGlobal('Notification', class {
    static permission = 'granted';
    constructor(_title: string, options: Record<string, unknown>) { notifications.push(options); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

describe('browser preferences', () => {
  it('migratesLegacyPreferencesAndPersistsTypedValuesAcrossReloads', async () => {
    localStorage.setItem('url-flow:prefs:v1', JSON.stringify({ closeToTray: false }));
    api = (await import('../../src/lib/browserApi')).browserApi;
    expect(await api.getPreferences()).toMatchObject({ closeToTray: false, reminderSound: true, quietHoursStart: '' });
    await api.setPreference('captureShortcut', 'Control+Alt+K');
    await api.setPreference('reminderSound', false);
    await api.setPreference('quietHoursStart', '22:00');
    const preferences = await api.setPreference('quietHoursEnd', '07:00');
    expect(JSON.parse(localStorage.getItem('url-flow:prefs:v1')!)).toEqual(preferences);
    vi.resetModules();
    expect(await (await import('../../src/lib/browserApi')).browserApi.getPreferences()).toEqual(preferences);
  });

  it('leavesQuietRemindersPendingAndDeliversThemAtTheEndBoundary', async () => {
    vi.setSystemTime(new Date(2026, 9, 30, 22, 0));
    api = (await import('../../src/lib/browserApi')).browserApi;
    await api.setPreference('quietHoursStart', '22:00');
    await api.setPreference('quietHoursEnd', '07:00');
    await api.setPreference('reminderSound', false);
    await api.load();
    const state = await api.create({ kind: 'note', title: 'Pending reminder', reminderAt: new Date().toISOString() });
    const reminder = structuredClone(state.reminders[0]);
    vi.advanceTimersByTime(15_000);
    expect((await api.load()).reminders[0]).toEqual(reminder);
    expect(notifications).toHaveLength(0);
    vi.setSystemTime(new Date(2026, 9, 31, 6, 59, 45));
    vi.advanceTimersByTime(15_000);
    expect(notifications).toEqual([{ body: 'Pending reminder', silent: true }]);
    expect((await api.load()).reminders[0].notifiedAt).toBe(new Date(2026, 9, 31, 7, 0).toISOString());
  });
});
