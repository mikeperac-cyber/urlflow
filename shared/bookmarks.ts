import type { BookmarkEntry } from './types';
import { isSafeExternalUrl, normalizeUrl } from './url';

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Reads a Netscape bookmark file as exported by Chrome, Edge, Firefox and Safari.
 * Folder names become the tag source; the path is kept as "Parent / Child".
 */
export function parseBookmarkFile(html: string): BookmarkEntry[] {
  if (!html || !/<a\b/i.test(html)) return [];
  const entries: BookmarkEntry[] = [];
  const folders: string[] = [];
  const seen = new Set<string>();
  const token = /<DT\s*>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DT\s*>\s*<A\b([^>]*)>([\s\S]*?)<\/A>|<DL\b[^>]*>|<\/DL>/gi;
  let match: RegExpExecArray | null;

  while ((match = token.exec(html)) !== null) {
    const [raw, folderName, attributes, linkText] = match;
    if (/^<DT/i.test(raw) && folderName !== undefined) {
      folders.push(cleanText(folderName).slice(0, 48));
      continue;
    }
    if (/^<\/DL/i.test(raw)) {
      folders.pop();
      continue;
    }
    if (linkText === undefined) continue; // <DL> opening tag

    const href = /HREF\s*=\s*["']([^"']+)["']/i.exec(attributes ?? '')?.[1];
    if (!href) continue;
    const normalized = normalizeUrl(href);
    if (!normalized.url || !isSafeExternalUrl(normalized.url)) continue;
    if (seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    entries.push({
      url: normalized.url,
      title: cleanText(linkText).slice(0, 300),
      folder: folders.filter(Boolean).join(' / ').slice(0, 120),
    });
    if (entries.length >= 10_000) break;
  }

  return entries;
}
