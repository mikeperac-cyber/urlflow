import { MAX_SELECTION_LENGTH } from '../shared/capture';
import type { CapturePayload } from '../shared/types';
import { isSafeExternalUrl, normalizeUrl } from '../shared/url';

export interface BatchChunk {
  batchId: string;
  index: number;
  total: number;
  data: string;
}

/** Parses one chunk of a chunked `urlflow://add` batch request. */
export function parseBatchChunk(raw: string): BatchChunk | null {
  try {
    const request = new URL(raw);
    if (
      request.protocol !== 'urlflow:' || request.hostname !== 'add' ||
      request.pathname !== '' || request.username || request.password || request.port
    ) return null;

    decodeURIComponent(request.search);
    const batchId = request.searchParams.get('batchId') ?? '';
    const data = request.searchParams.get('d') ?? '';
    const indexRaw = request.searchParams.get('i') ?? '';
    const totalRaw = request.searchParams.get('n') ?? '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(batchId)) return null;
    if (!/^[A-Za-z0-9_-]{1,2000}$/.test(data)) return null;
    if (!/^\d{1,2}$/.test(indexRaw) || !/^\d{1,2}$/.test(totalRaw)) return null;
    const index = Number(indexRaw);
    const total = Number(totalRaw);
    if (total < 1 || total > 60 || index >= total) return null;
    return { batchId, index, total, data };
  } catch {
    return null;
  }
}

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
    const selection = request.searchParams.get('selection')?.trim().slice(0, MAX_SELECTION_LENGTH);
    return {
      url,
      ...(title ? { title } : {}),
      ...(selection ? { selection } : {}),
      mode: 'dialog',
    };
  } catch {
    return null;
  }
}
