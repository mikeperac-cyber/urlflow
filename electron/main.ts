import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store';
import { createBackup, ensureDailyBackup, listBackups as readBackupList, readBackup } from './backups';
import * as core from '../shared/core';
import { parseBookmarkFile } from '../shared/bookmarks';
import { extractUrl, isSafeExternalUrl, normalizeUrl } from '../shared/url';
import type {
  AppState,
  BookmarkEntry,
  CapturePayload,
  ItemDraft,
  ItemPatch,
  MergeFieldChoices,
  Preferences,
  RepeatRule,
} from '../shared/types';

const APP_ID = 'com.urlflow.desktop';
const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
const rootDir = path.join(__dirname, '..');
const iconPath = path.join(rootDir, 'assets', 'icon.png');

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: Store;
let isQuitting = false;
let reminderTimer: NodeJS.Timeout | null = null;
let prefs: Preferences = { closeToTray: true };
let prefsPath = '';
let userDataPath = '';
let backupTimer: NodeJS.Timeout | null = null;

app.setName('URL Flow');
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function loadPreferences(filePath: string): Preferences {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { closeToTray: raw?.closeToTray !== false };
  } catch {
    return { closeToTray: true };
  }
}

function savePreferences(): void {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
  } catch (error) {
    console.error('[prefs] Could not save preferences', error);
  }
}

function broadcast(state: AppState): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send('state:changed', state);
  }
}

function broadcastHistory(): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send('history:changed', store.status());
  }
}

function refreshTrayTooltip(): void {
  if (!tray) return;
  const missed = core.missedReminders(store.get()).length;
  const upcoming = store.get().reminders.filter(
    (reminder) => !reminder.notifiedAt && new Date(reminder.remindAt).getTime() > Date.now(),
  ).length;
  tray.setToolTip(
    missed > 0
      ? `URL Flow · ${missed} missed ${missed === 1 ? 'reminder' : 'reminders'}`
      : `URL Flow · ${upcoming} upcoming ${upcoming === 1 ? 'reminder' : 'reminders'}`,
  );
}

function commit(next: AppState, label = 'Change'): AppState {
  const saved = store.commit(next, label);
  broadcast(saved);
  broadcastHistory();
  refreshTrayTooltip();
  ensureDailyBackup(userDataPath, saved);
  return saved;
}

function performUndo(): void {
  const result = store.undo();
  if (!result) return;
  broadcast(result.state);
  broadcastHistory();
  refreshTrayTooltip();
}

function performRedo(): void {
  const result = store.redo();
  if (!result) return;
  broadcast(result.state);
  broadcastHistory();
  refreshTrayTooltip();
}

function showWindow(): void {
  if (!window || window.isDestroyed()) {
    createWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function focusItem(itemId: string): void {
  showWindow();
  window?.webContents.send('app:focusItem', itemId);
}

/** Tray and global shortcut both land here: grab a URL from the clipboard and file it. */
async function requestCapture(): Promise<void> {
  showWindow();
  if (!window || window.isDestroyed()) return;
  const url = extractUrl(await clipboard.readText());
  const payload: CapturePayload = { url };
  const send = () => window?.webContents.send('app:capture', payload);
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
  else send();
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: 'URL Flow',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  window.once('ready-to-show', () => {
    window?.show();
  });

  window.on('close', (event) => {
    if (!isQuitting && prefs.closeToTray) {
      event.preventDefault();
      window?.hide();
    }
  });

  window.on('closed', () => {
    window = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const current = window?.webContents.getURL() ?? '';
    if (url !== current) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    }
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12') window?.webContents.toggleDevTools();
    });
  } else {
    void window.loadFile(path.join(rootDir, 'dist', 'index.html'));
  }
}

function createTray(): void {
  if (!fs.existsSync(iconPath)) return;
  const image = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  tray = new Tray(image);
  tray.setToolTip('URL Flow');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Save link from clipboard',
      accelerator: 'CommandOrControl+Shift+Space',
      registerAccelerator: false,
      click: () => requestCapture(),
    },
    { label: 'Open URL Flow', click: () => showWindow() },
    { label: 'Test notification', click: () => showNotification('URL Flow', 'Notifications are working.') },
    { type: 'separator' },
    {
      label: 'Quit URL Flow',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  refreshTrayTooltip();
  tray.setContextMenu(menu);
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

function showNotification(title: string, body: string, itemId?: string): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title,
    body,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    silent: false,
  });
  notification.on('click', () => {
    if (itemId) focusItem(itemId);
    else showWindow();
  });
  notification.show();
}

function tickReminders(): void {
  if (!store) return;
  const due = core.dueReminders(store.get());
  if (due.length === 0) {
    refreshTrayTooltip();
    return;
  }
  const supported = Notification.isSupported();
  if (!supported) {
    // Leave them due so the Reminders screen can show what was missed.
    refreshTrayTooltip();
    return;
  }
  let next = store.get();
  for (const reminder of due) {
    showNotification('Reminder · URL Flow', reminder.text, reminder.itemId);
    next = core.markReminderNotified(next, reminder.id);
  }
  commit(next, 'Fired reminders');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .trim();
}

async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized.url || !isSafeExternalUrl(normalized.url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(normalized.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 URL-Flow/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && contentType !== '') return null;
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('utf-8').decode(buffer.slice(0, 400_000));
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return null;
    const title = decodeEntities(match[1].replace(/\s+/g, ' '));
    return title ? title.slice(0, 200) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function registerIpc(): void {
  ipcMain.handle('state:load', () => store.get());

  ipcMain.handle('prefs:get', () => prefs);
  ipcMain.handle('prefs:set', (_event, { key, value }: { key: keyof Preferences; value: boolean }) => {
    if (key === 'closeToTray') {
      prefs.closeToTray = Boolean(value);
      savePreferences();
    }
    return prefs;
  });

  ipcMain.handle('item:create', (_event, draft: ItemDraft) => {
    const result = core.createItem(store.get(), draft);
    return commit(result.state, `Created a ${draft.kind}`);
  });

  ipcMain.handle('item:update', (_event, { id, patch }: { id: string; patch: ItemPatch }) => {
    return commit(core.updateItem(store.get(), id, patch), 'Edited an item');
  });

  ipcMain.handle('item:remove', (_event, id: string) =>
    commit(core.removeItem(store.get(), id), 'Deleted an item'),
  );
  ipcMain.handle('item:archive', (_event, id: string) =>
    commit(core.setArchived(store.get(), id, true), 'Archived an item'),
  );
  ipcMain.handle('item:restore', (_event, id: string) =>
    commit(core.setArchived(store.get(), id, false), 'Restored an item'),
  );
  ipcMain.handle('item:markReviewed', (_event, id: string) =>
    commit(core.markReviewed(store.get(), id), 'Reviewed an item'),
  );

  ipcMain.handle(
    'item:merge',
    (
      _event,
      { primaryId, otherId, choices }: {
        primaryId: string;
        otherId: string;
        choices?: MergeFieldChoices;
      },
    ) => commit(core.mergeItems(store.get(), primaryId, otherId, choices ?? {}), 'Merged items'),
  );

  ipcMain.handle(
    'item:mergeMany',
    (
      _event,
      { primaryId, otherIds, choices }: {
        primaryId: string;
        otherIds: string[];
        choices?: MergeFieldChoices;
      },
    ) =>
      commit(
        core.mergeMany(store.get(), primaryId, otherIds, choices ?? {}),
        `Merged ${otherIds.length + 1} items`,
      ),
  );

  ipcMain.handle('plan:toggleStep', (_event, { planId, stepId }: { planId: string; stepId: string }) =>
    commit(core.toggleStep(store.get(), planId, stepId), 'Toggled a step'),
  );

  ipcMain.handle(
    'reminder:set',
    (
      _event,
      {
        itemId,
        remindAt,
        text,
        repeat,
      }: { itemId: string; remindAt: string; text?: string; repeat?: RepeatRule },
    ) => commit(core.setReminder(store.get(), itemId, remindAt, text, repeat), 'Scheduled a reminder'),
  );
  ipcMain.handle('reminder:snooze', (_event, { id, minutes }: { id: string; minutes: number }) =>
    commit(core.snoozeReminder(store.get(), id, minutes), 'Snoozed a reminder'),
  );
  ipcMain.handle('reminder:dismiss', (_event, id: string) =>
    commit(core.removeReminder(store.get(), id), 'Dismissed a reminder'),
  );
  ipcMain.handle('reminder:remove', (_event, id: string) =>
    commit(core.removeReminder(store.get(), id), 'Removed a reminder'),
  );
  ipcMain.handle('match:ignore', (_event, key: string) =>
    commit(core.ignoreMatch(store.get(), key), 'Ignored a match'),
  );
  ipcMain.handle('match:unignore', (_event, key: string) =>
    commit(core.unignoreMatch(store.get(), key), 'Restored a match'),
  );

  ipcMain.handle('link:open', async (_event, id: string) => {
    const item = store.get().items.find((entry) => entry.id === id && entry.kind === 'link');
    if (!item || item.kind !== 'link') return store.get();
    if (isSafeExternalUrl(item.url)) {
      await shell.openExternal(item.url);
    }
    return commit(
      {
        ...store.get(),
        items: store.get().items.map((entry) =>
          entry.id === id ? { ...entry, lastOpenedAt: new Date().toISOString() } : entry,
        ),
      },
      'Opened a link',
    );
  });

  ipcMain.handle('clipboard:write', async (_event, text: string) => {
    await clipboard.writeText(String(text ?? ''));
  });

  ipcMain.handle('clipboard:read', () => clipboard.readText());

  ipcMain.handle('net:fetchTitle', (_event, url: string) => fetchPageTitle(String(url ?? '')));

  ipcMain.handle('data:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog({
      title: 'Export URL Flow data',
      defaultPath: `url-flow-backup-${stamp}.json`,
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, JSON.stringify(store.get(), null, 2), 'utf8');
    return result.filePath;
  });

  ipcMain.handle('data:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import URL Flow backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    const imported = core.normalizeState(JSON.parse(raw));
    ensureDailyBackup(userDataPath, store.get());
    return commit(imported, 'Imported a backup');
  });

  ipcMain.handle('data:reveal', () => {
    shell.showItemInFolder(store.filePath);
  });

  ipcMain.handle('notification:test', () => {
    showNotification('URL Flow', 'Reminders will appear like this.');
  });

  ipcMain.handle('history:undo', () => {
    const result = store.undo();
    if (!result) return null;
    broadcast(result.state);
    broadcastHistory();
    refreshTrayTooltip();
    return result.state;
  });

  ipcMain.handle('history:redo', () => {
    const result = store.redo();
    if (!result) return null;
    broadcast(result.state);
    broadcastHistory();
    refreshTrayTooltip();
    return result.state;
  });

  ipcMain.handle('history:status', () => store.status());

  ipcMain.handle('bookmarks:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import browser bookmarks',
      properties: ['openFile'],
      filters: [{ name: 'Bookmark export', extensions: ['html', 'htm'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const file = result.filePaths[0];
    const stats = fs.statSync(file);
    if (stats.size > 25_000_000) throw new Error('That bookmark file is too large to import.');
    const entries = parseBookmarkFile(fs.readFileSync(file, 'utf8'));
    return { fileName: path.basename(file), entries };
  });

  ipcMain.handle(
    'bookmarks:import',
    (_event, { entries, tagFolders }: { entries: BookmarkEntry[]; tagFolders: boolean }) => {
      const result = core.importBookmarks(store.get(), entries, tagFolders);
      if (result.added === 0) return { state: store.get(), added: 0, skipped: result.skipped };
      const saved = commit(result.state, `Imported ${result.added} bookmarks`);
      return { state: saved, added: result.added, skipped: result.skipped };
    },
  );

  ipcMain.handle('backup:list', () => readBackupList(userDataPath));

  ipcMain.handle('backup:now', () => createBackup(userDataPath, store.get()));

  ipcMain.handle('backup:restore', (_event, file: string) => {
    const restored = readBackup(userDataPath, file);
    ensureDailyBackup(userDataPath, store.get());
    return commit(restored, 'Restored a backup');
  });
}

app.on('second-instance', () => {
  showWindow();
});

app.whenReady().then(() => {
  userDataPath = app.getPath('userData');
  prefsPath = path.join(userDataPath, 'preferences.json');
  prefs = loadPreferences(prefsPath);
  store = new Store(userDataPath);
  ensureDailyBackup(userDataPath, store.get());
  registerIpc();
  createWindow();
  createTray();

  const menu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CommandOrControl+Z',
          registerAccelerator: false,
          click: () => performUndo(),
        },
        {
          label: 'Redo',
          accelerator: 'CommandOrControl+Shift+Z',
          registerAccelerator: false,
          click: () => performRedo(),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
  ]);
  Menu.setApplicationMenu(menu);
  window?.setMenuBarVisibility(false);

  const registered = globalShortcut.register('CommandOrControl+Shift+Space', requestCapture);
  if (!registered) {
    console.warn('[capture] Could not register Ctrl+Shift+Space — another app may own it.');
  }

  reminderTimer = setInterval(tickReminders, 15_000);
  setTimeout(tickReminders, 2_500);
  backupTimer = setInterval(() => ensureDailyBackup(userDataPath, store.get()), 60 * 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Stay alive in the tray so scheduled reminders can still fire.
  if (process.platform !== 'darwin' && !prefs.closeToTray) app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('quit', () => {
  if (reminderTimer) clearInterval(reminderTimer);
  if (backupTimer) clearInterval(backupTimer);
});
