// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureSnapshotDocument, htmlToMarkdown } from '../../electron/snapshotCapture';

const pageUrl = 'https://example.com/articles/page';
const articleHtml = `<!doctype html><html><head><title>Snapshot Title</title></head><body>
<article>
  <h1>Snapshot Title</h1>
  <p>First paragraph with <strong>bold</strong> text and a <a href="/next">link</a>.</p>
  <h2>Section</h2>
  <p>Second paragraph explains the subject in enough detail to be readable.</p>
  <p>Third paragraph closes the article.</p>
</article>
</body></html>`;

function response(body: BodyInit | null, url: string, mime: string, status = 200): Response {
  const result = new Response(body, { status, headers: { 'content-type': mime } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offline snapshot capture', () => {
  it('convertsReadableArticleToMarkdown', () => {
    const result = htmlToMarkdown(articleHtml, pageUrl);
    expect(result?.title).toBe('Snapshot Title');
    expect(result?.markdown.startsWith('First paragraph')).toBe(true);
    expect(result?.markdown).toContain('**bold**');
    expect(result?.markdown).toContain('## Section');
    expect(result?.markdown).toContain('Third paragraph');
  });

  it('returnsNullForPagesWithoutReadableContent', () => {
    expect(htmlToMarkdown('<html><body></body></html>', pageUrl)).toBeNull();
  });

  it('fetchesThePageAndReturnsItsFinalUrl', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response(articleHtml, 'https://example.com/final', 'text/html'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await captureSnapshotDocument(pageUrl);
    expect(result?.sourceUrl).toBe('https://example.com/final');
    expect(result?.title).toBe('Snapshot Title');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejectsNonHtmlResponses', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      response('{"ok":true}', pageUrl, 'application/json'),
    ));
    expect(await captureSnapshotDocument(pageUrl)).toBeNull();
  });

  it('returnsNullForUnsafeUrlsWithoutFetching', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    for (const url of ['file:///secret', 'javascript:alert(1)', 'not a url']) {
      expect(await captureSnapshotDocument(url), url).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
