import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Preferences } from '../../shared/types';

const boundary = vi.hoisted(() => ({
  directory: '', handlers: new Map<string, (...args: any[]) => any>(),
  register: vi.fn(), unregister: vi.fn(), notifications: [] as Record<string, unknown>[],
  menus: [] as any[][],
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: true, setName: vi.fn(), setAppUserModelId: vi.fn(), requestSingleInstanceLock: () => true,
    setAsDefaultProtocolClient: vi.fn(), isReady: () => true, getPath: () => boundary.directory,
    on: vi.fn(), whenReady: () => Promise.resolve(),
  },
  BrowserWindow: class {
    webContents = { mainFrame: {}, send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() };
    once = vi.fn(); on = vi.fn(); loadFile = vi.fn(); setMenuBarVisibility = vi.fn();
    isDestroyed = () => false;
  },
  ipcMain: { on: vi.fn(), handle: (name: string, handler: (...args: any[]) => any) => boundary.handlers.set(name, handler) },
  Menu: { buildFromTemplate: (template: any[]) => { boundary.menus.push(template); return template; }, setApplicationMenu: vi.fn() },
  globalShortcut: { register: boundary.register, unregister: boundary.unregister },
  Notification: class {
    static isSupported = () => true;
    constructor(options: Record<string, unknown>) { boundary.notifications.push(options); }
    on = vi.fn(); show = vi.fn();
  },
  clipboard: {}, dialog: {}, shell: {},
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
  Tray: class { setToolTip = vi.fn(); setContextMenu = vi.fn(); on = vi.fn(); },
}));
vi.mock('../../electron/backups', () => ({ ensureDailyBackup: vi.fn(), createBackup: vi.fn(), listBackups: vi.fn(), readBackup: vi.fn() }));
vi.mock('../../electron/pageMetadata', () => ({ fetchPageMetadata: vi.fn(), readFaviconDataUrl: vi.fn() }));

function invoke(channel: string, argument?: unknown): any {
  return boundary.handlers.get(channel)!({}, argument);
}
async function boot(raw: unknown = { closeToTray: false }): Promise<void> {
  fs.writeFileSync(path.join(boundary.directory, 'preferences.json'), JSON.stringify(raw));
  await import('../../electron/main');
}
function savedPreferences(): unknown {
  return JSON.parse(fs.readFileSync(path.join(boundary.directory, 'preferences.json'), 'utf8'));
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  boundary.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'url-flow-prefs-'));
  boundary.handlers.clear(); boundary.register.mockReset().mockReturnValue(true); boundary.unregister.mockReset();
  boundary.notifications.length = 0; boundary.menus.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks(); vi.useRealTimers();
  fs.rmSync(boundary.directory, { recursive: true, force: true });
});

describe('desktop preferences', () => {
  it('loadsLegacyPreferencesAndRegistersTheConfiguredCaptureShortcut', async () => {
    await boot({ closeToTray: false, captureShortcut: 'Control+Alt+K' });
    expect(invoke('prefs:get')).toMatchObject({ closeToTray: false, captureShortcut: 'Control+Alt+K', reminderSound: true });
    expect(boundary.register).toHaveBeenCalledWith('Control+Alt+K', expect.any(Function));
  });

  it('persistsTypedPreferencesAndReplacesTheCaptureShortcut', async () => {
    await boot();
    const oldShortcut = invoke('prefs:get').captureShortcut;
    const next: Preferences = invoke('prefs:set', { key: 'captureShortcut', value: 'Control+Alt+K' });
    expect(boundary.unregister).toHaveBeenCalledWith(oldShortcut);
    expect(boundary.register).toHaveBeenLastCalledWith('Control+Alt+K', expect.any(Function));
    expect(next.captureShortcut).toBe('Control+Alt+K');
    expect(savedPreferences()).toEqual(next);
    expect(boundary.menus.some((menu) => menu[0]?.accelerator === 'Control+Alt+K')).toBe(true);
    expect(invoke('prefs:set', { key: 'reminderSound', value: false }).reminderSound).toBe(false);
    expect(savedPreferences()).toMatchObject({ closeToTray: false, reminderSound: false });
  });

  it.each(['unavailable', 'invalid'] as const)('restoresThePreviousShortcutAndPreferencesWhenTheCandidateIs%s', async (failure) => {
    await boot();
    const before: Preferences = structuredClone(invoke('prefs:get'));
    const disk = savedPreferences();
    boundary.register.mockImplementation((shortcut: string) => {
      if (shortcut !== 'Control+Alt+K') return true;
      if (failure === 'invalid') throw new Error('Invalid accelerator');
      return false;
    });
    if (failure === 'invalid') boundary.unregister.mockImplementation((shortcut: string) => {
      if (shortcut === 'Control+Alt+K') throw new Error('Invalid accelerator');
    });
    expect(() => invoke('prefs:set', { key: 'captureShortcut', value: 'Control+Alt+K' })).toThrow(/shortcut/i);
    expect(boundary.unregister).toHaveBeenCalledWith(before.captureShortcut);
    expect(boundary.register).toHaveBeenLastCalledWith(before.captureShortcut, expect.any(Function));
    expect(invoke('prefs:get')).toEqual(before);
    expect(savedPreferences()).toEqual(disk);
  });

  it('restoresThePreviousShortcutIfPreferencesCannotBeSaved', async () => {
    await boot();
    const before: Preferences = structuredClone(invoke('prefs:get'));
    const disk = savedPreferences();
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('Read only'); });
    expect(() => invoke('prefs:set', { key: 'captureShortcut', value: 'Control+Alt+K' })).toThrow(/save/i);
    expect(boundary.unregister).toHaveBeenCalledWith('Control+Alt+K');
    expect(boundary.register).toHaveBeenLastCalledWith(before.captureShortcut, expect.any(Function));
    expect(invoke('prefs:get')).toEqual(before);
    expect(savedPreferences()).toEqual(disk);
  });

  it('defersDueRemindersDuringQuietHoursThenDeliversThemWithTheSoundPreference', async () => {
    vi.setSystemTime(new Date(2026, 9, 30, 22, 0));
    await boot({ quietHoursStart: '22:00', quietHoursEnd: '07:00', reminderSound: false });
    const state: AppState = invoke('item:create', { kind: 'note', title: 'Pending reminder', reminderAt: new Date().toISOString() });
    const reminder = structuredClone(state.reminders[0]);
    vi.advanceTimersByTime(2_500);
    expect(invoke('state:load').reminders[0]).toEqual(reminder);
    expect(boundary.notifications).toHaveLength(0);
    vi.setSystemTime(new Date(2026, 9, 31, 7, 0));
    vi.advanceTimersByTime(15_000);
    expect(boundary.notifications).toEqual([expect.objectContaining({ body: 'Pending reminder', silent: true })]);
    expect(invoke('state:load').reminders[0].notifiedAt).not.toBeNull();
  });
});
