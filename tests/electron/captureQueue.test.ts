import { describe, expect, it, vi } from 'vitest';
import { CaptureQueue } from '../../electron/captureQueue';
import { parseCaptureProtocol } from '../../electron/deepLink';

const protocol = (host: string) => parseCaptureProtocol(`urlflow://add?url=${encodeURIComponent(`https://${host}/`)}`)!;

describe('CaptureQueue', () => {
  it('retainsInitialCaptureUntilRendererReady', () => {
    const queue = new CaptureQueue();
    const deliver = vi.fn();
    queue.enqueue(protocol('initial.test'));
    expect(deliver).not.toHaveBeenCalled();
    queue.setDelivery(deliver);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      url: 'https://initial.test/', mode: 'dialog', requestId: expect.any(String),
    }));
    queue.setDelivery(deliver);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('deliversSecondInstanceCaptureOnce', () => {
    const queue = new CaptureQueue();
    const deliver = vi.fn();
    queue.setDelivery(deliver);
    queue.enqueue(protocol('second.test'));
    expect(deliver).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: 'https://second.test/' }));
    queue.setDelivery(null);
    queue.setDelivery(deliver);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('keepsMultipleCapturesInFifoOrder', () => {
    const queue = new CaptureQueue();
    const deliver = vi.fn();
    queue.enqueue({ ...protocol('first.test'), requestId: 'untrusted' });
    queue.enqueue({ ...protocol('second.test'), requestId: 'untrusted' });
    queue.setDelivery(deliver);
    queue.enqueue(protocol('third.test'));
    const payloads = deliver.mock.calls.map(([payload]) => payload);
    expect(payloads.map(({ url }) => url)).toEqual(['https://first.test/', 'https://second.test/', 'https://third.test/']);
    expect(new Set(payloads.map(({ requestId }) => requestId)).size).toBe(3);
    for (const { requestId } of payloads) expect(requestId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  });

  it('pausesForANewRendererAndDefaultsToClipboardMode', () => {
    const queue = new CaptureQueue();
    const oldRenderer = vi.fn();
    const newRenderer = vi.fn();
    queue.setDelivery(oldRenderer);
    queue.setDelivery(null);
    queue.enqueue({ url: null });
    expect(oldRenderer).not.toHaveBeenCalled();
    queue.setDelivery(newRenderer);
    expect(newRenderer).toHaveBeenCalledExactlyOnceWith({ url: null, mode: 'clipboard', requestId: expect.any(String) });
  });
});
