// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLinkHealth, checkLinks, isBrokenHealth } from '../../electron/linkHealth';

const target = { id: 'l1', url: 'https://example.com/article' };

function response(status: number, location?: string): Response {
  const headers = new Headers();
  if (location) headers.set('location', location);
  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('link health checks', () => {
  it('reportsAHealthyPage', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response(200)));
    const result = await checkLinkHealth(target);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe(target.url);
    expect(result.permanent).toBe(false);
    expect(isBrokenHealth(result)).toBe(false);
    expect(result.checkedAt).toBeTruthy();
    expect(result.message).toContain('200');
  });

  it('fallsBackToGetWhenHeadIsNotAllowed', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);
    expect((await checkLinkHealth(target)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('HEAD');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET');
  });

  it('marksMissingPagesAsPermanentFailures', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response(404)));
    const result = await checkLinkHealth(target);
    expect(result.status).toBe(404);
    expect(result.permanent).toBe(true);
    expect(isBrokenHealth(result)).toBe(true);
  });

  it('treatsServerErrorsAsTemporary', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response(503)));
    const result = await checkLinkHealth(target);
    expect(result.status).toBe(503);
    expect(result.permanent).toBe(false);
    expect(isBrokenHealth(result)).toBe(true);
  });

  it('followsSafeRedirectsAndRejectsUnsafeOnes', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(301, 'https://example.com/moved'))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);
    const moved = await checkLinkHealth(target);
    expect(moved.status).toBe(200);
    expect(moved.finalUrl).toBe('https://example.com/moved');

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response(302, 'file:///private/page'));
    const unsafe = await checkLinkHealth(target);
    expect(unsafe.status).toBe('error');
    expect(unsafe.finalUrl).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reportsNetworkErrorsWithoutThrowing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
    const result = await checkLinkHealth(target);
    expect(result.status).toBe('error');
    expect(result.permanent).toBe(false);
    expect(isBrokenHealth(result)).toBe(true);
  });

  it('checksInOrderWithBoundedConcurrencyAndStopsWhenAborted', async () => {
    const urls: string[] = [];
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
      urls.push(String(url));
      if (String(url).endsWith('/b')) controller.abort();
      return response(200);
    }));
    const links = [
      { id: 'a', url: 'https://example.com/a' },
      { id: 'b', url: 'https://example.com/b' },
      { id: 'c', url: 'https://example.com/c' },
    ];
    const results = await checkLinks(links, { concurrency: 2, signal: controller.signal });
    expect(results.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(urls.length).toBeLessThan(3);
  });

  it('rejectsUnsafeInputUrlsWithoutFetching', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    for (const url of ['file:///secret', 'javascript:alert(1)', 'mailto:a@b.c']) {
      const result = await checkLinkHealth({ id: 'x', url });
      expect(result.status, url).toBe('error');
      expect(result.permanent).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
