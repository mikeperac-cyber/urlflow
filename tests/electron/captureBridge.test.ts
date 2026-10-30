import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowApi } from '../../shared/types';

const bridge = vi.hoisted(() => ({
  expose: vi.fn(), invoke: vi.fn(), on: vi.fn(), send: vi.fn(), removeListener: vi.fn(), listenerCount: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: bridge.expose },
  ipcRenderer: bridge,
}));

beforeEach(() => { vi.resetAllMocks(); vi.resetModules(); bridge.listenerCount.mockReturnValue(0); });

describe('capture bridge', () => {
  it('acknowledgesReadinessOnlyAfterCaptureRegistrationAndPausesOnUnsubscribe', async () => {
    await import('../../electron/preload');
    const api = bridge.expose.mock.calls[0][1] as FlowApi;
    expect(bridge.send).not.toHaveBeenCalled();
    const callback = vi.fn();
    const unsubscribe = api.onCapture(callback);
    expect(bridge.on).toHaveBeenCalledWith('app:capture', expect.any(Function));
    expect(bridge.send).toHaveBeenCalledWith('app:capture-ready', true);
    expect(bridge.on.mock.invocationCallOrder[0]).toBeLessThan(bridge.send.mock.invocationCallOrder[0]);
    const listener = bridge.on.mock.calls[0][1];
    const payload = { url: 'https://example.com/', mode: 'dialog', requestId: 'request' };
    listener({}, payload);
    expect(callback).toHaveBeenCalledExactlyOnceWith(payload);
    unsubscribe();
    expect(bridge.removeListener).toHaveBeenCalledWith('app:capture', listener);
    expect(bridge.send).toHaveBeenLastCalledWith('app:capture-ready', false);
  });
});
