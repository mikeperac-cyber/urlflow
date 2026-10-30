import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, ItemDraft, LinkItem } from '../../shared/types';

const boundary = vi.hoisted(() => ({
  directory: '', handlers: new Map<string, (...args: any[]) => any>(), openExternal: vi.fn(),
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
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  globalShortcut: { register: () => true }, Notification: {}, clipboard: {}, dialog: {},
  nativeImage: { createFromPath: () => ({ resize: vi.fn() }) },
  Tray: class { setToolTip = vi.fn(); setContextMenu = vi.fn(); on = vi.fn(); },
  shell: { openExternal: boundary.openExternal },
}));
vi.mock('../../electron/backups', () => ({ ensureDailyBackup: vi.fn(), createBackup: vi.fn(), listBackups: vi.fn(), readBackup: vi.fn() }));
vi.mock('../../electron/pageMetadata', () => ({ fetchPageMetadata: vi.fn(), readFaviconDataUrl: vi.fn() }));

const now = '2026-10-30T12:00:00.000Z';
function invoke(channel: string, argument?: unknown): any {
  return boundary.handlers.get(channel)!({}, argument);
}
function create(readingState: 'unread' | 'later' = 'later'): string {
  const state: AppState = invoke('item:create', { kind: 'link', title: 'Saved page', url: 'https://example.com', readingState } satisfies ItemDraft);
  return state.items[0].id;
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  boundary.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'url-flow-open-'));
  boundary.handlers.clear();
  boundary.openExternal.mockReset().mockResolvedValue(undefined);
  await import('../../electron/main');
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(boundary.directory, { recursive: true, force: true });
});

describe('desktop link opening', () => {
  it('doesNotOpenOrModifyArchivedBatchSelections', async () => {
    const id = create();
    const before = structuredClone(invoke('item:archive', id));
    expect(await invoke('link:openMany', [id])).toBeNull();
    expect(invoke('state:load')).toEqual(before);
    expect(boundary.openExternal).not.toHaveBeenCalled();
    expect(invoke('history:undo').items[0].archivedAt).toBeNull();
  });

  it('preservesMetadataWhenArchivedDuringABatchOpen', async () => {
    const id = create();
    let finish!: () => void;
    boundary.openExternal.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const opening = invoke('link:openMany', [id]);
    const archived = structuredClone(invoke('item:archive', id));
    finish();
    expect(await opening).toBeNull();
    expect(invoke('state:load')).toEqual(archived);
    expect(invoke('history:undo').items[0].archivedAt).toBeNull();
  });

  it.each(['mailto:user@example.com', 'javascript:1'])('doesNotOpenRawNonHttpBatchTargets (%s)', async (url) => {
    const id = create();
    const state: AppState = invoke('state:load');
    (state.items[0] as LinkItem).url = url;
    const before = structuredClone(state);
    expect(await invoke('link:openMany', [id])).toBeNull();
    expect(invoke('state:load')).toEqual(before);
    expect(boundary.openExternal).not.toHaveBeenCalled();
  });

  it('opensSelectedLinksInOneUndoStepAndPreservesInFlightEdits', async () => {
    const first = create();
    const failed = create();
    const last = create('unread');
    const noteState: AppState = invoke('item:create', { kind: 'note', title: 'Keep note' });
    const note = noteState.items.find((item) => item.kind === 'note')!;
    let finish!: () => void;
    boundary.openExternal
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('Cannot open'))
      .mockResolvedValueOnce(undefined);
    const opening = invoke('link:openMany', [first, failed, last, first, 'missing', note.id]);
    invoke('item:markReviewed', first);
    const before = structuredClone(invoke('state:load'));
    finish();
    const final: AppState = await opening;

    expect(boundary.openExternal).toHaveBeenCalledTimes(3);
    for (const id of [first, last]) {
      expect(final.items.find((item) => item.id === id)).toMatchObject({ readingState: 'read', lastOpenedAt: now });
    }
    expect(final.items.find((item) => item.id === first)).toMatchObject({ reviewedAt: now });
    expect(final.items.find((item) => item.id === failed)).toMatchObject({ readingState: 'later', lastOpenedAt: null });
    expect(invoke('history:undo')).toEqual(before);
    expect(invoke('history:redo')).toEqual(final);
  });

  it('bulkTriageCommitsTheEntireSelectionInOneUndoStep', () => {
    const first = create();
    const second = create();
    const before = structuredClone(invoke('state:load'));
    const final: AppState = invoke('link:bulkTriage', { ids: [first, second], action: { type: 'add-tags', tags: ['Research'] } });
    expect(final.items.every((item) => item.tags.includes('Research'))).toBe(true);
    expect(invoke('history:undo')).toEqual(before);
    expect(invoke('history:redo')).toEqual(final);
  });

  it.each(['stale-selection', 'all-opens-failed', 'unchanged-ignore'] as const)('returnsNullWithoutReplacingPriorHistoryFor%s', async (scenario) => {
    const id = create();
    const beforePrior = structuredClone(invoke('state:load'));
    if (scenario === 'unchanged-ignore') {
      invoke('link:bulkTriage', { ids: [id], action: { type: 'ignore-matches', keys: ['a|b'] } });
    } else {
      invoke('item:create', { kind: 'note', title: 'Previous change' });
    }
    const before = structuredClone(invoke('state:load'));
    boundary.openExternal.mockRejectedValue(new Error('Cannot open'));
    const result = scenario === 'all-opens-failed' ? await invoke('link:openMany', [id])
      : invoke('link:bulkTriage', { ids: scenario === 'stale-selection' ? ['missing'] : [id],
        action: scenario === 'stale-selection' ? { type: 'archive' } : { type: 'ignore-matches', keys: ['a|b'] } });
    expect(result).toBeNull();
    expect(invoke('state:load')).toEqual(before);
    expect(invoke('history:undo')).toEqual(beforePrior);
  });

  it.each(['unread', 'later'] as const)('commitsReadWithOpenedAtWithoutOverwritingAnInFlightReview (%s)', async (readingState) => {
    const id = create(readingState);
    let finish!: () => void;
    boundary.openExternal.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const opening = invoke('link:open', id);
    expect(invoke('state:load').items[0]).toMatchObject({ readingState, lastOpenedAt: null });
    invoke('item:markReviewed', id);
    finish();
    const final = await opening;

    expect(boundary.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
    expect(final.items[0]).toMatchObject({ readingState: 'read', lastOpenedAt: now, reviewedAt: now });
    const saved = JSON.parse(fs.readFileSync(path.join(boundary.directory, 'url-flow-data.json'), 'utf8'));
    expect(saved.items[0]).toMatchObject({ readingState: 'read', lastOpenedAt: now, reviewedAt: now });
  });

  it('doesNotRecordAnOpenWhenTheExternalOpenFails', async () => {
    const id = create();
    const before = invoke('state:load');
    boundary.openExternal.mockRejectedValue(new Error('Could not open'));
    await expect(invoke('link:open', id)).rejects.toThrow('Could not open');
    expect(invoke('state:load')).toEqual(before);
  });

  it('ignoresUnsafeMissingAndNonLinkTargets', async () => {
    const id = create();
    const state: AppState = invoke('state:load');
    (state.items[0] as LinkItem).url = 'javascript:alert(1)';
    const before = JSON.stringify(state);
    expect(await invoke('link:open', id)).toBeNull();
    expect(await invoke('link:open', 'missing')).toBeNull();
    expect(JSON.stringify(invoke('state:load'))).toBe(before);
    const noteState: AppState = invoke('item:create', { kind: 'note', title: 'A note' });
    const note = noteState.items.find((entry) => entry.kind === 'note')!;
    expect(await invoke('link:open', note.id)).toBeNull();
    expect(invoke('state:load')).toEqual(noteState);
    expect(boundary.openExternal).not.toHaveBeenCalled();
  });

  it('returnsNullWithoutChangingArchivedSingleLinksOrPriorHistory', async () => {
    const id = create();
    const before = structuredClone(invoke('item:archive', id));
    expect(await invoke('link:open', id)).toBeNull();
    expect(invoke('state:load')).toEqual(before);
    expect(boundary.openExternal).not.toHaveBeenCalled();
    expect(invoke('history:undo').items[0].archivedAt).toBeNull();
  });

  it('returnsNullWhenASingleLinkIsArchivedDuringItsOpen', async () => {
    const id = create();
    let finish!: () => void;
    boundary.openExternal.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const opening = invoke('link:open', id);
    const archived = structuredClone(invoke('item:archive', id));
    finish();
    expect(await opening).toBeNull();
    expect(invoke('state:load')).toEqual(archived);
    expect(invoke('history:undo').items[0].archivedAt).toBeNull();
  });
});
