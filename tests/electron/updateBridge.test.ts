import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowApi } from '../../shared/types';

const bridge = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn(), on: vi.fn(), send: vi.fn(), removeListener: vi.fn(), listenerCount: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: bridge.expose }, ipcRenderer: bridge }));
beforeEach(() => { vi.resetAllMocks(); vi.resetModules(); });

describe('update preload bridge', () => {
  it('subscribesBeforeReadingStatusAndDoesNotOverwriteANewerEvent', async () => {
    let resolveStatus!: (value: unknown) => void;
    bridge.invoke.mockImplementation((channel: string) => channel === 'update:status' ? new Promise((resolve) => { resolveStatus = resolve; }) : Promise.resolve());
    await import('../../electron/preload');
    const api = bridge.expose.mock.calls[0][1] as FlowApi;
    const callback = vi.fn();
    const unsubscribe = api.onUpdateStatus(callback);
    expect(bridge.on.mock.invocationCallOrder[0]).toBeLessThan(bridge.invoke.mock.invocationCallOrder[0]);
    const listener = bridge.on.mock.calls[0][1];
    listener({}, { state: 'downloaded', enabled: true, version: '1.2.0' });
    resolveStatus({ state: 'checking', enabled: true });
    await Promise.resolve();
    expect(callback).toHaveBeenCalledExactlyOnceWith({ state: 'downloaded', enabled: true, version: '1.2.0' });
    unsubscribe();
    listener({}, { state: 'error', enabled: true, message: 'Late event' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(bridge.removeListener).toHaveBeenCalledWith('update:changed', listener);
    await api.checkForUpdates(); await api.installUpdate();
    expect(bridge.invoke.mock.calls.map(([channel]) => channel)).toEqual(['update:status', 'update:check', 'update:install']);
  });
});
