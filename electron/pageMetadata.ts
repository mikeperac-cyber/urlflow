import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LinkMetadata } from '../shared/types';

export interface ParsedPageMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  faviconUrl: string | null;
}

const HTML_LIMIT = 400_000;
const ICON_LIMIT = 128_000;
const ICON_HEADER_LIMIT = 64;
const ICON_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']);
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

function webUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function cancelBody(response: FetchResponse): void {
  void response.body?.cancel().catch(() => undefined);
}

async function fetchWebResponse(url: string, signal: AbortSignal, accept: string): Promise<FetchResponse | null> {
  // Follow manually so every redirect target is checked before it is requested.
  let current = webUrl(url);
  for (let redirects = 0; current && redirects <= 10; redirects += 1) {
    const response = await fetch(current, {
      signal, redirect: 'manual', headers: { Accept: accept },
    });
    if (response.url && !webUrl(response.url)) {
      cancelBody(response);
      return null;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      cancelBody(response);
      if (!location) return null;
      try { current = webUrl(new URL(location, response.url || current).href); }
      catch { return null; }
      continue;
    }
    if (!response.ok || !webUrl(response.url)) {
      cancelBody(response);
      return null;
    }
    return response;
  }
  return null;
}

async function readBoundedBody(response: FetchResponse, limit: number, truncate: boolean): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, length);
      const remaining = limit - length;
      const size = Math.min(value.byteLength, remaining);
      if (size) chunks.push(Buffer.from(value.subarray(0, size)));
      length += size;
      if (value.byteLength > remaining || (truncate && length === limit)) {
        void reader.cancel().catch(() => undefined);
        return truncate ? Buffer.concat(chunks, length) : null;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function cacheFavicon(iconUrl: string, userDataPath: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetchWebResponse(iconUrl, signal, 'image/png,image/jpeg,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon');
    if (!response) return null;
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ICON_MIMES.has(mime)) { cancelBody(response); return null; }
    const bytes = await readBoundedBody(response, ICON_LIMIT, false);
    if (!bytes?.length) return null;
    const key = createHash('sha256').update(iconUrl).digest('hex');
    const directory = path.join(userDataPath, 'favicons');
    await mkdir(directory, { recursive: true });
    // Keep MIME and payload in one generation, published by a single rename.
    const temporary = path.join(directory, `${key}.${randomUUID()}.tmp`);
    try {
      const header = Buffer.from(`URLFLOW-FAVICON-1\n${mime}\n${bytes.length}\n`, 'ascii');
      await writeFile(temporary, Buffer.concat([header, bytes]));
      await rename(temporary, path.join(directory, key));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return key;
  } catch {
    return null;
  }
}

export async function fetchPageMetadata(rawUrl: string, userDataPath: string): Promise<LinkMetadata | null> {
  const url = webUrl(rawUrl);
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetchWebResponse(url, controller.signal, 'text/html,application/xhtml+xml');
    if (!response) return null;
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (mime && mime !== 'text/html' && mime !== 'application/xhtml+xml') { cancelBody(response); return null; }
    const bytes = await readBoundedBody(response, HTML_LIMIT, true);
    if (!bytes) return null;
    const parsed = parsePageMetadata(bytes.toString('utf8'), response.url);
    const iconUrl = parsed.faviconUrl ?? new URL('/favicon.ico', response.url).href;
    const faviconKey = await cacheFavicon(iconUrl, userDataPath, controller.signal);
    return {
      title: parsed.title?.slice(0, 300) || null,
      description: parsed.description?.slice(0, 500) || null,
      siteName: parsed.siteName?.slice(0, 120) || null,
      faviconKey,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCacheFile(file: string, limit: number): Promise<Buffer | null> {
  const handle = await open(file, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size === 0 || stats.size > limit) return null;
    // Bound the read even if another process replaces or grows this file.
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    return length > 0 && length <= limit ? bytes.subarray(0, length) : null;
  } finally {
    await handle.close();
  }
}

export async function readFaviconDataUrl(userDataPath: string, key: string): Promise<string | null> {
  // Validate before constructing a cache path, including calls over IPC.
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null;
  try {
    const file = path.join(userDataPath, 'favicons', key);
    const record = await readCacheFile(file, ICON_LIMIT + ICON_HEADER_LIMIT);
    if (!record) return null;
    const header = record.subarray(0, ICON_HEADER_LIMIT).toString('utf8')
      .match(/^URLFLOW-FAVICON-1\n([a-z0-9/.-]+)\n([1-9][0-9]{0,5})\n/);
    if (!header || !ICON_MIMES.has(header[1])) return null;
    const payloadLength = Number(header[2]);
    if (payloadLength > ICON_LIMIT || record.length !== header[0].length + payloadLength) return null;
    const bytes = record.subarray(header[0].length);
    return `data:${header[1]};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

// Keep parsing usable in Electron main, which has no browser DOM.
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    hellip: '…', copy: '©', reg: '®', trade: '™',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) {
      const key = code.toLowerCase();
      return Object.hasOwn(named, key) ? named[key] : entity;
    }
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number)
      : '\ufffd';
  });
}

function cleanText(value: string | undefined): string | null {
  return value === undefined ? null : decodeEntities(value).replace(/\s+/g, ' ').trim() || null;
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const content = tag.replace(/^<\w+\b/, '').replace(/\/?>$/, '');
  const pattern = /([^\s=<>"'`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>"'`=]+)))?/g;
  for (const match of content.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (!(name in result)) result[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

export function parsePageMetadata(html: string, pageUrl: string): ParsedPageMetadata {
  const meta = new Map<string, string>();
  let faviconUrl: string | null = null;
  let title: string | null = null;
  // Quoted values may contain '>'; attribute order and quote style are arbitrary.
  // Consume title/RCDATA and raw-text elements whole so examples inside them
  // cannot masquerade as metadata. Generic tags consume their attributes too.
  const tokens = /<!--[\s\S]*?(?:-->|$)|<(title|script|style|textarea|xmp|iframe|noembed|noframes)\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)(?:<\/\1\s*>|$)|<([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (const match of html.matchAll(tokens)) {
    if (match[1]) {
      if (match[1].toLowerCase() === 'title' && title === null) title = cleanText(match[2]);
      continue;
    }
    const tagName = match[3]?.toLowerCase();
    if (tagName !== 'meta' && tagName !== 'link') continue;
    const attrs = attributes(match[0]);
    if (tagName === 'meta') {
      const key = (attrs.property || attrs.name || '').toLowerCase();
      const value = cleanText(attrs.content);
      if (value && !meta.has(key)) meta.set(key, value);
    } else if (!faviconUrl && (attrs.rel || '').toLowerCase().split(/\s+/).includes('icon') && attrs.href?.trim()) {
      try {
        const url = new URL(decodeEntities(attrs.href.trim()), pageUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') faviconUrl = url.href;
      } catch {
        // A malformed icon declaration should not discard useful page text.
      }
    }
  }
  return {
    title: meta.get('og:title') ?? title,
    description: meta.get('og:description') ?? meta.get('description') ?? null,
    siteName: meta.get('og:site_name') ?? null,
    faviconUrl,
  };
}
