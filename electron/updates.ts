import type { UpdateStatus } from '../shared/types';
import type { AppUpdater } from 'electron-updater';

type Updater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'allowDowngrade' | 'disableWebInstaller' | 'on' | 'checkForUpdates' | 'quitAndInstall'>;

export async function loadElectronUpdater(): Promise<Updater> {
  const { default: electronUpdater } = await import('electron-updater');
  return electronUpdater.autoUpdater;
}

interface UpdateOptions {
  mode: string;
  packaged: boolean;
  platform: string;
  portable: boolean;
  loadUpdater: () => Promise<Updater>;
  onStatus: (status: UpdateStatus) => void;
  setQuitting: (value: boolean) => void;
}

/** The build mode is embedded while compiling; runtime environment variables cannot enable updates. */
export function createUpdateController(options: UpdateOptions) {
  const enabled = options.packaged && options.platform === 'win32' && !options.portable && options.mode === 'release';
  const unavailable = options.mode === 'local'
    ? 'Automatic updates are not configured for this local build. Install a newer local installer manually.'
    : 'Automatic updates are available in signed, installed Windows releases.';
  let status: UpdateStatus = enabled ? { state: 'idle', enabled: true } : { state: 'idle', enabled: false, message: unavailable };
  let updaterPromise: Promise<Updater> | null = null;
  let checkPromise: Promise<UpdateStatus> | null = null;
  let started = false;
  let installing = false;

  function publish(next: UpdateStatus) {
    status = next;
    options.onStatus(next);
  }
  function fail(error: unknown) {
    if (installing) {
      installing = false;
      options.setQuitting(false);
    }
    publish({ state: 'error', enabled: true, message: error instanceof Error ? error.message : 'Could not check for updates.' });
  }
  function load(): Promise<Updater> {
    if (!updaterPromise) {
      updaterPromise = options.loadUpdater().then((updater) => {
        updater.autoDownload = true;
        updater.autoInstallOnAppQuit = true;
        updater.allowDowngrade = false;
        updater.disableWebInstaller = true;
        updater.on('checking-for-update', () => publish({ state: 'checking', enabled: true }));
        updater.on('update-available', (info: { version: string }) => publish({ state: 'available', enabled: true, version: info.version }));
        updater.on('update-not-available', (info: { version: string }) => publish({ state: 'not-available', enabled: true, version: info.version }));
        updater.on('download-progress', (progress: { percent: number }) => publish({
          state: 'downloading', enabled: true, version: 'version' in status ? status.version : undefined,
          percent: Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0,
        }));
        updater.on('update-downloaded', (info: { version: string }) => publish({ state: 'downloaded', enabled: true, version: info.version }));
        updater.on('error', fail);
        return updater;
      }).catch((error) => { updaterPromise = null; throw error; });
    }
    return updaterPromise;
  }
  function check(): Promise<UpdateStatus> {
    if (!enabled || status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded') return Promise.resolve(status);
    if (checkPromise) return checkPromise;
    publish({ state: 'checking', enabled: true });
    checkPromise = (async () => {
      try { await (await load()).checkForUpdates(); }
      catch (error) { fail(error); }
      finally { checkPromise = null; }
      return status;
    })();
    return checkPromise;
  }
  return {
    getStatus: () => status,
    check,
    start: () => {
      if (started) return Promise.resolve(status);
      started = true;
      return check();
    },
    install: async () => {
      if (!enabled || status.state !== 'downloaded' || installing) return status;
      installing = true;
      try {
        const updater = await load();
        options.setQuitting(true);
        updater.quitAndInstall(false, true);
      } catch (error) {
        fail(error);
      }
      return status;
    },
  };
}
