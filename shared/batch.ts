import { cleanTags } from './tags';
import { PLAN_COLORS, type BatchCaptureEntry, type BatchCaptureRequest } from './types';

export const MAX_BATCH_TABS = 200;
export const MAX_BATCH_PAYLOAD = 256_000;

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BATCH_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Base64url -> UTF-8 JSON text without depending on Buffer or atob. */
function decodeBase64Url(input: string): string | null {
  if (!input || !/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    const value = BASE64URL.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer = bits === 0 ? 0 : buffer & ((1 << bits) - 1);
    }
  }
  try {
    let encoded = '';
    for (const byte of bytes) encoded += `%${byte.toString(16).padStart(2, '0')}`;
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** Defensive reader for a batch produced by the extension or any other client. */
export function parseBatchRequest(value: unknown): BatchCaptureRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'links' && raw.kind !== 'plan') return null;
  if (!Array.isArray(raw.entries) || raw.entries.length === 0 || raw.entries.length > MAX_BATCH_TABS) {
    return null;
  }

  const entries: BatchCaptureEntry[] = [];
  for (const entry of raw.entries) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url) return null;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 300) : '';
    entries.push(title ? { url, title } : { url });
  }

  const tags = cleanTags(raw.tags);
  const batchId = typeof raw.batchId === 'string' && BATCH_ID.test(raw.batchId) ? raw.batchId : undefined;
  const base = {
    entries,
    ...(tags.length > 0 ? { tags } : {}),
    ...(batchId ? { batchId } : {}),
  };

  if (raw.kind === 'links') return { kind: 'links', ...base };

  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 300) : '';
  if (!title) return null;
  const color = typeof raw.color === 'string' && PLAN_COLORS.includes(raw.color) ? raw.color : undefined;
  return { kind: 'plan', title, ...(color ? { color } : {}), ...base };
}

export function decodeBatchPayload(data: string): BatchCaptureRequest | null {
  if (typeof data !== 'string' || !data || data.length > MAX_BATCH_PAYLOAD) return null;
  const json = decodeBase64Url(data);
  if (json === null || json.length > MAX_BATCH_PAYLOAD) return null;
  try {
    return parseBatchRequest(JSON.parse(json));
  } catch {
    return null;
  }
}
