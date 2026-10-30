import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyState } from '../../shared/types';

const electron = vi.hoisted(() => ({
  appEvents: new Map<string, (...args: any[]) => void>(),
  contentsEvents: new Map<string, (...args: any[]) => void>(),
  ipcEvents: new Map<string, (...args: any[]) => void>(),
  registerProtocol: vi.fn(), send: vi.fn(), focus: vi.fn(), show: vi.fn(), ready: false,
  resolveReady: null as (() => void) | null,
  contents: null as any,
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: true, setName: vi.fn(), setAppUserModelId: vi.fn(), requestSingleInstanceLock: () => true,
    setAsDefaultProtocolClient: electron.registerProtocol, isReady: () => electron.ready, getPath: () => 'unused',
    on: (name: string, handler: (...args: any[]) => void) => electron.appEvents.set(name, handler),
    whenReady: () => new Promise<void>((resolve) => { electron.resolveReady = resolve; }),
  },
  BrowserWindow: class {
    webContents = electron.contents = {
      mainFrame: {}, send: electron.send, setWindowOpenHandler: vi.fn(),
      on: (name: string, handler: (...args: any[]) => void) => electron.contentsEvents.set(name, handler),
    };
    once = vi.fn(); on = vi.fn(); loadFile = vi.fn(); setMenuBarVisibility = vi.fn();
    isDestroyed = () => false; isMinimized = () => false; show = electron.show; focus = electron.focus;
  },
  ipcMain: {
    on: (name: string, handler: (...args: any[]) => void) => electron.ipcEvents.set(name, handler), handle: vi.fn(),
  },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  globalShortcut: { register: () => true }, Notification: {}, Tray: {}, clipboard: {}, dialog: {}, nativeImage: {}, shell: {},
}));
vi.mock('node:fs', () => ({ default: { existsSync: () => false, readFileSync: () => { throw new Error('no preferences'); } } }));
vi.mock('../../electron/store', () => ({ Store: class { get = () => emptyState(); } }));
vi.mock('../../electron/backups', () => ({ ensureDailyBackup: vi.fn(), createBackup: vi.fn(), listBackups: vi.fn(), readBackup: vi.fn() }));
vi.mock('../../electron/pageMetadata', () => ({ fetchPageMetadata: vi.fn(), readFaviconDataUrl: vi.fn() }));

const originalArgv = process.argv;
afterEach(() => { process.argv = originalArgv; vi.useRealTimers(); });

describe('protocol startup', () => {
  it('queuesStartupSecondInstanceAndOpenUrlUntilTheCurrentRendererSubscribes', async () => {
    vi.useFakeTimers();
    const protocol = (host: string) => `urlflow://add?url=${encodeURIComponent(`https://${host}/`)}&mode=clipboard&requestId=external`;
    process.argv = ['url-flow.exe', protocol('initial.test')];
    await import('../../electron/main');
    expect(electron.registerProtocol).toHaveBeenCalledWith('urlflow');
    expect(electron.send).not.toHaveBeenCalled();
    electron.appEvents.get('second-instance')!({}, ['url-flow.exe', 'https://ignored.test/', protocol('second.test')]);
    const preventDefault = vi.fn();
    electron.appEvents.get('open-url')!({ preventDefault }, protocol('mac.test'));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(electron.send).not.toHaveBeenCalled();
    electron.ready = true;
    electron.resolveReady!();
    await Promise.resolve();
    const acknowledge = electron.ipcEvents.get('app:capture-ready')!;
    acknowledge({ sender: {}, senderFrame: {} }, true);
    expect(electron.send).not.toHaveBeenCalled();
    const event = { sender: electron.contents, senderFrame: electron.contents.mainFrame };
    acknowledge(event, true);
    expect(electron.send.mock.calls.map(([channel, payload]) => [channel, payload.url, payload.mode])).toEqual([
      ['app:capture', 'https://initial.test/', 'dialog'],
      ['app:capture', 'https://second.test/', 'dialog'],
      ['app:capture', 'https://mac.test/', 'dialog'],
    ]);
    expect(new Set(electron.send.mock.calls.map(([, payload]) => payload.requestId)).size).toBe(3);
    acknowledge(event, true);
    expect(electron.send).toHaveBeenCalledTimes(3);
    electron.appEvents.get('second-instance')!({}, [protocol('running.test')]);
    expect(electron.focus).toHaveBeenCalled();
    expect(electron.send).toHaveBeenCalledTimes(4);
    electron.contentsEvents.get('did-start-loading')!();
    electron.appEvents.get('open-url')!({ preventDefault }, protocol('reload.test'));
    expect(electron.send).toHaveBeenCalledTimes(4);
    acknowledge(event, true);
    expect(electron.send).toHaveBeenLastCalledWith('app:capture', expect.objectContaining({ url: 'https://reload.test/' }));
    expect(electron.send).toHaveBeenCalledTimes(5);
  });
});
