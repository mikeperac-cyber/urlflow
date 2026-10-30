import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkMetadata } from '../../shared/types';
import { usePageMetadata } from '../../src/components/usePageMetadata';

const metadata = (title: string): LinkMetadata => ({ title, description: `${title} description`, siteName: title, faviconKey: null });
function deferred() {
  let resolve!: (value: LinkMetadata | null) => void;
  const promise = new Promise<LinkMetadata | null>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('usePageMetadata', () => {
  it('latestUrlWinsWhenMetadataResponsesResolveOutOfOrder', async () => {
    const first = deferred();
    const second = deferred();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ url }) => usePageMetadata(url, fetch), { initialProps: { url: 'first.test' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    rerender({ url: 'second.test' });
    await act(async () => { vi.advanceTimersByTime(400); });
    await act(async () => { second.resolve(metadata('Second')); });
    expect(result.current.metadata?.title).toBe('Second');
    await act(async () => { first.resolve(metadata('First')); });
    expect(result.current.metadata).toEqual(metadata('Second'));
    expect(result.current.fetching).toBe(false);
  });

  it('debouncesAndFetchesTheLatestNormalizedUrlOnly', async () => {
    const fetch = vi.fn().mockResolvedValue(metadata('Page'));
    const { result, rerender } = renderHook(({ url }) => usePageMetadata(url, fetch), { initialProps: { url: 'first.test' } });
    await act(async () => { vi.advanceTimersByTime(399); });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ url: ' www.second.test/article?utm_source=mail ' });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://second.test/article');
    expect(result.current.metadata?.title).toBe('Page');
    rerender({ url: 'https://second.test/article' });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clearsOldMetadataImmediatelyAndIgnoresRequestsAfterTheUrlIsCleared', async () => {
    const pending = deferred();
    const fetch = vi.fn().mockResolvedValueOnce(metadata('First')).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ url }) => usePageMetadata(url, fetch), { initialProps: { url: 'first.test' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(result.current.metadata?.title).toBe('First');
    rerender({ url: 'second.test' });
    expect(result.current.metadata).toBeNull();
    await act(async () => { vi.advanceTimersByTime(400); });
    rerender({ url: '' });
    await act(async () => { pending.resolve(metadata('Obsolete')); });
    expect(result.current).toEqual({ metadata: null, fetching: false });
  });

  it('settlesFailuresWithoutBlockingAndCancelsPendingDebouncesOnUnmount', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const { result, rerender, unmount } = renderHook(({ url }) => usePageMetadata(url, fetch), { initialProps: { url: 'first.test' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(result.current).toEqual({ metadata: null, fetching: false });
    rerender({ url: 'second.test' });
    unmount();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
