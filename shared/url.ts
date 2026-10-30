const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'source',
  'si',
  '_ga',
  '_gl',
  'mkt_tok',
  'trk',
]);

const BARE_URL =
  /((?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:[^\s<>"')]+)?)/i;

export function extractUrl(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(BARE_URL);
  if (!match) return null;
  const candidate = match[1].replace(/[.,;:!?]+$/, '');
  return normalizeUrl(candidate).url;
}

function ensureProtocol(raw: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
}

export interface NormalizedUrl {
  url: string;
  key: string;
}

export function normalizeUrl(input: unknown): NormalizedUrl {
  const raw = String(input ?? '').trim();
  if (!raw) return { url: '', key: '' };
  let parsed: URL;
  try {
    parsed = new URL(ensureProtocol(raw));
  } catch {
    return { url: raw, key: raw.toLowerCase() };
  }
  const protocol = parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.protocol : 'https:';
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);

  const params = [...parsed.searchParams.entries()]
    .filter(([name]) => {
      const lower = name.toLowerCase();
      return !TRACKING_PARAMS.has(lower) && !lower.startsWith('utm_');
    })
    .sort(([a], [b]) => a.localeCompare(b));

  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const port = parsed.port && !((protocol === 'https:' && parsed.port === '443') || (protocol === 'http:' && parsed.port === '80'))
    ? `:${parsed.port}`
    : '';

  const query = params.map(([k, v]) => (v ? `${k}=${v}` : k)).join('&');
  const url = `${protocol}//${host}${port}${path}${query ? `?${query}` : ''}`;
  return { url, key: url.toLowerCase() };
}

export function hostOf(url: string): string {
  try {
    return new URL(ensureProtocol(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(ensureProtocol(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function faviconTone(url: string): string {
  const host = hostOf(url);
  let hash = 0;
  for (let i = 0; i < host.length; i += 1) hash = (hash * 31 + host.charCodeAt(i)) % 360;
  return `hsl(${hash} 62% 58%)`;
}

export function initialsFor(value: string): string {
  const cleaned = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const first = cleaned.split(/[.\s\-_/]/).filter(Boolean)[0] ?? cleaned;
  return first.slice(0, 2).toUpperCase();
}
