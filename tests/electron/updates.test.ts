import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createUpdateController } from '../../electron/updates';

function setup(mode = 'release', packaged = true, platform = 'win32', portable = false) {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: false, autoInstallOnAppQuit: false, allowDowngrade: true, disableWebInstaller: false,
    checkForUpdates: vi.fn().mockResolvedValue(null), quitAndInstall: vi.fn(),
  });
  const loadUpdater = vi.fn().mockResolvedValue(updater);
  const onStatus = vi.fn();
  const setQuitting = vi.fn();
  const controller = createUpdateController({ mode, packaged, platform, portable, loadUpdater, onStatus, setQuitting });
  return { updater, controller, loadUpdater, onStatus, setQuitting };
}

describe('Windows update controller', () => {
  it('doesNotLoadOrCheckOutsideSignedInstalledReleaseBuilds', async () => {
    for (const boundary of [setup('local'), setup('portable'), setup('release', false), setup('release', true, 'linux'), setup('release', true, 'win32', true)]) {
      await boundary.controller.start();
      await boundary.controller.check();
      await boundary.controller.install();
      expect(boundary.loadUpdater).not.toHaveBeenCalled();
      expect(boundary.controller.getStatus()).toMatchObject({ state: 'idle', enabled: false });
    }
  });

  it('checksOnceAtStartupAndForwardsDownloadAndInstallStates', async () => {
    const { updater, controller, onStatus, setQuitting } = setup();
    await controller.start();
    await controller.start();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater).toMatchObject({ autoDownload: true, autoInstallOnAppQuit: true, allowDowngrade: false, disableWebInstaller: true });
    updater.emit('update-available', { version: '1.2.0' });
    expect(controller.getStatus()).toEqual({ state: 'available', enabled: true, version: '1.2.0' });
    updater.emit('download-progress', { percent: 150 });
    expect(controller.getStatus()).toEqual({ state: 'downloading', enabled: true, version: '1.2.0', percent: 100 });
    updater.emit('update-downloaded', { version: '1.2.0' });
    await controller.install();
    expect(setQuitting).toHaveBeenCalledWith(true);
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
    expect(onStatus).toHaveBeenCalledWith({ state: 'downloaded', enabled: true, version: '1.2.0' });
  });

  it('doesNotInstallBeforeADownloadAndReportsCheckFailures', async () => {
    const { controller, updater } = setup();
    await controller.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.checkForUpdates.mockRejectedValue(new Error('Feed unavailable'));
    expect(await controller.check()).toMatchObject({ state: 'error', enabled: true, message: 'Feed unavailable' });
    updater.emit('update-not-available', { version: '1.1.0' });
    expect(controller.getStatus()).toEqual({ state: 'not-available', enabled: true, version: '1.1.0' });
  });

  it('deduplicatesConcurrentManualChecksAndPreservesDownloadedState', async () => {
    const { controller, updater } = setup();
    let finish!: () => void;
    updater.checkForUpdates.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = controller.check();
    await Promise.resolve();
    const second = controller.check();
    await vi.waitFor(() => expect(updater.checkForUpdates).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([first, second]);
    updater.emit('update-downloaded', { version: '1.2.0' });
    await controller.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().state).toBe('downloaded');
  });

  it('restoresWindowQuitBehaviorAfterAnAsynchronousInstallFailure', async () => {
    const { controller, updater, setQuitting } = setup();
    await controller.start();
    updater.emit('update-downloaded', { version: '1.2.0' });
    await controller.install();
    updater.emit('error', new Error('Installer could not start'));
    expect(setQuitting).toHaveBeenLastCalledWith(false);
    expect(controller.getStatus()).toMatchObject({ state: 'error', message: 'Installer could not start' });
    updater.emit('update-downloaded', { version: '1.2.0' });
    await controller.install();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(2);
  });
});
