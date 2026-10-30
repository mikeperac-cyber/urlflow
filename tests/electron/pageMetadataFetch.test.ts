// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fetchPageMetadata, readFaviconDataUrl } from '../../electron/pageMetadata';

const pageUrl = 'https://example.com/articles/page';
const iconBytes = Buffer.from([0, 0, 1, 0, 9, 8, 7]);
function response(body: BodyInit | null, url: string, mime: string, status = 200): Response {
  const result = new Response(body, { status, headers: { 'content-type': mime } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

describe('bounded metadata fetching and favicon cache', () => {
  let directory: string;
  const mockedFetch = vi.fn<typeof fetch>();
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'url-flow-metadata-'));
    mockedFetch.mockReset();
    vi.stubGlobal('fetch', mockedFetch);
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it('fetchesMetadataAndCachesAllowedIcon', async () => {
    mockedFetch.mockResolvedValueOnce(response('<title>Useful page</title><meta name="description" content="Summary"><meta property="og:site_name" content="Example"><link rel="icon" href="/icon.ico">', pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(iconBytes, 'https://example.com/icon.ico', 'image/vnd.microsoft.icon'));
    const metadata = await fetchPageMetadata(pageUrl, directory);
    const key = createHash('sha256').update('https://example.com/icon.ico').digest('hex');
    expect(metadata).toEqual({ title: 'Useful page', description: 'Summary', siteName: 'Example', faviconKey: key });
    expect(metadata?.faviconKey).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFaviconDataUrl(directory, key)).toBe(`data:image/vnd.microsoft.icon;base64,${iconBytes.toString('base64')}`);
  });

  it('fallsBackToOriginFavicon', async () => {
    mockedFetch.mockResolvedValueOnce(response('<title>Page</title>', 'https://redirected.example/path', 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(iconBytes, 'https://redirected.example/favicon.ico', 'image/x-icon'));
    const result = await fetchPageMetadata(pageUrl, directory);
    expect(mockedFetch.mock.calls[1][0]).toBe('https://redirected.example/favicon.ico');
    expect(await readFaviconDataUrl(directory, result!.faviconKey!)).toContain('data:image/x-icon;base64,');
  });

  it('rejectsUnsafeRedirects', async () => {
    mockedFetch.mockResolvedValueOnce(response('<title>Unsafe</title>', 'file:///private/page.html', 'text/html'));
    expect(await fetchPageMetadata(pageUrl, directory)).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'file:///private/page.html' } }));
    expect(await fetchPageMetadata(pageUrl, directory)).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('rejectsUnsafeInitialUrlsWithoutFetching', async () => {
    for (const url of ['file:///secret', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/a']) {
      expect(await fetchPageMetadata(url, directory)).toBeNull();
    }
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('followsSafeRelativeRedirectsAndRejectsUnsafeIconRedirects', async () => {
    const redirect = response(null, pageUrl, 'text/html', 302);
    redirect.headers.set('location', '/final');
    mockedFetch.mockResolvedValueOnce(redirect);
    mockedFetch.mockResolvedValueOnce(response('<title>Final page</title>', 'https://example.com/final', 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(iconBytes, 'file:///secret/icon.png', 'image/png'));
    expect(await fetchPageMetadata(pageUrl, directory)).toEqual({ title: 'Final page', description: null, siteName: null, faviconKey: null });
    expect(mockedFetch.mock.calls[1][0]).toBe('https://example.com/final');
    expect(mockedFetch.mock.calls.every(([, options]) => options?.redirect === 'manual')).toBe(true);
    expect(await readdir(directory)).toEqual([]);
  });

  it('ignoresUnsupportedIconMime', async () => {
    mockedFetch.mockResolvedValueOnce(response('<title>Page</title>', pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response('<svg/>', 'https://example.com/favicon.ico', 'image/svg+xml'));
    expect((await fetchPageMetadata(pageUrl, directory))?.faviconKey).toBeNull();
    expect(await readdir(directory)).toEqual([]);
  });

  it('doesNotReadPastHtmlLimit', async () => {
    let pulls = 0;
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        const text = pulls === 1 ? '<title>Within cap</title>' : '<meta property="og:title" content="Outside cap">';
        const bytes = Buffer.alloc(pulls === 1 ? 400_000 : 20_000, 32);
        bytes.write(text);
        controller.enqueue(bytes);
      },
      cancel: canceled,
    }, { highWaterMark: 0 });
    mockedFetch.mockResolvedValueOnce(response(body, pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(null, 'https://example.com/favicon.ico', 'image/png', 404));
    const result = await fetchPageMetadata(pageUrl, directory);
    expect(result?.title).toBe('Within cap');
    expect(pulls).toBe(1);
    expect(canceled).toHaveBeenCalledOnce();
  });

  it('doesNotCacheOversizedIcon', async () => {
    let pulls = 0;
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(64_000)); },
      cancel: canceled,
    }, { highWaterMark: 0 });
    mockedFetch.mockResolvedValueOnce(response('<title>Page</title>', pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(body, 'https://example.com/favicon.ico', 'image/png'));
    expect((await fetchPageMetadata(pageUrl, directory))?.faviconKey).toBeNull();
    expect(pulls).toBe(3);
    expect(canceled).toHaveBeenCalledOnce();
    expect(await readdir(directory)).toEqual([]);
  });

  it('acceptsAnIconExactlyAtTheLimitAndCapsFetchedText', async () => {
    mockedFetch.mockResolvedValueOnce(response(`<title>${'t'.repeat(400)}</title><meta name="description" content="${'d'.repeat(700)}"><meta property="og:site_name" content="${'s'.repeat(200)}">`, pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(Buffer.alloc(128_000, 1), 'https://example.com/favicon.ico', 'image/png'));
    const result = await fetchPageMetadata(pageUrl, directory);
    expect(result?.title).toHaveLength(300);
    expect(result?.description).toHaveLength(500);
    expect(result?.siteName).toHaveLength(120);
    const data = await readFaviconDataUrl(directory, result!.faviconKey!);
    expect(Buffer.from(data!.split(',')[1], 'base64')).toHaveLength(128_000);
  });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon'])('preserves supported MIME %s', async (mime) => {
    mockedFetch.mockResolvedValueOnce(response('<title>Page</title>', pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(iconBytes, 'https://example.com/favicon.ico', mime));
    const result = await fetchPageMetadata(pageUrl, directory);
    expect(await readFaviconDataUrl(directory, result!.faviconKey!)).toBe(`data:${mime};base64,${iconBytes.toString('base64')}`);
  });

  it('returnsNullForMissingCorruptOrInvalidCacheKeys', async () => {
    const key = 'a'.repeat(64);
    expect(await readFaviconDataUrl(directory, key)).toBeNull();
    await mkdir(path.join(directory, 'favicons'));
    await writeFile(path.join(directory, 'favicons', key), iconBytes);
    await writeFile(path.join(directory, 'favicons', `${key}.mime`), 'image/svg+xml');
    for (const invalid of ['../../secret', 'A'.repeat(64), 'a'.repeat(63), '']) {
      expect(await readFaviconDataUrl(directory, invalid)).toBeNull();
    }
    expect(await readFaviconDataUrl(directory, key)).toBeNull();
    await writeFile(path.join(directory, 'favicons', `${key}.mime`), 'image/png');
    await writeFile(path.join(directory, 'favicons', key), Buffer.alloc(128_001));
    expect(await readFaviconDataUrl(directory, key)).toBeNull();
    await writeFile(path.join(directory, 'favicons', key), Buffer.alloc(0));
    expect(await readFaviconDataUrl(directory, key)).toBeNull();
  });

  it('retainsPageMetadataWhenCacheCannotBeWritten', async () => {
    await writeFile(path.join(directory, 'favicons'), 'a file blocks the cache directory');
    mockedFetch.mockResolvedValueOnce(response('<title>Keep title</title>', pageUrl, 'text/html'));
    mockedFetch.mockResolvedValueOnce(response(iconBytes, 'https://example.com/favicon.ico', 'image/png'));
    expect(await fetchPageMetadata(pageUrl, directory)).toEqual({ title: 'Keep title', description: null, siteName: null, faviconKey: null });
  });

  it('timesOutAfterNineSeconds', async () => {
    vi.useFakeTimers();
    mockedFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = fetchPageMetadata(pageUrl, directory);
    await vi.advanceTimersByTimeAsync(9000);
    expect(await pending).toBeNull();
  });
});
