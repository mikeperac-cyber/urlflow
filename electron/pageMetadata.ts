export interface ParsedPageMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  faviconUrl: string | null;
}

// Keep parsing usable in Electron main, which has no browser DOM.
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    hellip: '…', copy: '©', reg: '®', trade: '™',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity;
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
  const source = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const meta = new Map<string, string>();
  let faviconUrl: string | null = null;
  // Quoted values may contain '>'; attribute order and quote style are arbitrary.
  for (const match of source.matchAll(/<(meta|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = attributes(match[0]);
    if (match[1].toLowerCase() === 'meta') {
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
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source);
  return {
    title: meta.get('og:title') ?? cleanText(title?.[1]),
    description: meta.get('og:description') ?? meta.get('description') ?? null,
    siteName: meta.get('og:site_name') ?? null,
    faviconUrl,
  };
}
