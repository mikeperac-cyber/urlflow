import type { CapturePayload } from '../shared/types';
import { isSafeExternalUrl, normalizeUrl } from '../shared/url';

export function parseCaptureProtocol(raw: string): CapturePayload | null {
  try {
    const request = new URL(raw);
    if (
      request.protocol !== 'urlflow:' || request.hostname !== 'add' ||
      request.pathname !== '' || request.username || request.password || request.port
    ) return null;

    // URLSearchParams tolerates malformed escapes; reject them before decoding.
    decodeURIComponent(request.search);
    const rawUrl = request.searchParams.get('url');
    if (!rawUrl) return null;

    // normalizeUrl repairs unsupported schemes, so validate the original first.
    const target = new URL(rawUrl);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
    if (!isSafeExternalUrl(rawUrl)) return null;

    const url = normalizeUrl(rawUrl).url;
    if (!isSafeExternalUrl(url)) return null;
    const title = request.searchParams.get('title')?.trim();
    return { url, ...(title ? { title } : {}), mode: 'dialog' };
  } catch {
    return null;
  }
}
