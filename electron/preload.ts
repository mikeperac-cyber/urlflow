import { contextBridge, ipcRenderer } from 'electron';
import type { FlowApi, Preferences } from '../shared/types';

const api: FlowApi = {
  load: () => ipcRenderer.invoke('state:load'),
  getPreferences: () => ipcRenderer.invoke('prefs:get'),
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    ipcRenderer.invoke('prefs:set', { key, value }),
  create: (draft) => ipcRenderer.invoke('item:create', draft),
  update: (id, patch) => ipcRenderer.invoke('item:update', { id, patch }),
  remove: (id) => ipcRenderer.invoke('item:remove', id),
  archive: (id) => ipcRenderer.invoke('item:archive', id),
  restore: (id) => ipcRenderer.invoke('item:restore', id),
  markReviewed: (id) => ipcRenderer.invoke('item:markReviewed', id),
  merge: (primaryId, otherId, choices) => ipcRenderer.invoke('item:merge', { primaryId, otherId, choices }),
  mergeMany: (primaryId, otherIds, choices) =>
    ipcRenderer.invoke('item:mergeMany', { primaryId, otherIds, choices }),
  toggleStep: (planId, stepId) => ipcRenderer.invoke('plan:toggleStep', { planId, stepId }),
  setReminder: (itemId, remindAt, text, repeat) =>
    ipcRenderer.invoke('reminder:set', { itemId, remindAt, text, repeat }),
  snoozeReminder: (id, minutes) => ipcRenderer.invoke('reminder:snooze', { id, minutes }),
  dismissReminder: (id) => ipcRenderer.invoke('reminder:dismiss', id),
  removeReminder: (id) => ipcRenderer.invoke('reminder:remove', id),
  ignoreMatch: (key) => ipcRenderer.invoke('match:ignore', key),
  unignoreMatch: (key) => ipcRenderer.invoke('match:unignore', key),
  openLink: (id) => ipcRenderer.invoke('link:open', id),
  openLinks: (ids) => ipcRenderer.invoke('link:openMany', ids),
  bulkTriage: (ids, action) => ipcRenderer.invoke('link:bulkTriage', { ids, action }),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  fetchTitle: (url) => ipcRenderer.invoke('net:fetchTitle', url),
  fetchMetadata: (url) => ipcRenderer.invoke('net:fetchMetadata', url),
  readFavicon: (key) => ipcRenderer.invoke('favicon:read', key),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  revealDataFile: () => ipcRenderer.invoke('data:reveal'),
  testNotification: () => ipcRenderer.invoke('notification:test'),
  undo: () => ipcRenderer.invoke('history:undo'),
  redo: () => ipcRenderer.invoke('history:redo'),
  historyStatus: () => ipcRenderer.invoke('history:status'),
  pickBookmarks: () => ipcRenderer.invoke('bookmarks:pick'),
  importBookmarks: (entries, tagFolders) => ipcRenderer.invoke('bookmarks:import', { entries, tagFolders }),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (file) => ipcRenderer.invoke('backup:restore', file),
  backupNow: () => ipcRenderer.invoke('backup:now'),
  onState: (callback) => {
    const listener = (_event: unknown, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  onHistory: (callback) => {
    const listener = (_event: unknown, status: Parameters<typeof callback>[0]) => callback(status);
    ipcRenderer.on('history:changed', listener);
    return () => ipcRenderer.removeListener('history:changed', listener);
  },
  onFocusItem: (callback) => {
    const listener = (_event: unknown, itemId: string) => callback(itemId);
    ipcRenderer.on('app:focusItem', listener);
    return () => ipcRenderer.removeListener('app:focusItem', listener);
  },
  onCapture: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]) => callback(payload);
    ipcRenderer.on('app:capture', listener);
    ipcRenderer.send('app:capture-ready', true);
    return () => {
      ipcRenderer.removeListener('app:capture', listener);
      if (ipcRenderer.listenerCount('app:capture') === 0) ipcRenderer.send('app:capture-ready', false);
    };
  },
};

contextBridge.exposeInMainWorld('flow', api);
