import { isSafeExternalUrl } from '../shared/url';
import type { LinkHealthCheck, LinkHealthStatus } from '../shared/types';

export type HealthStatus = LinkHealthStatus;
export type LinkHealthResult = LinkHealthCheck;

export interface LinkHealthTarget {
  id: string;
  url: string;
}

export interface LinkHealthOptions {
  concurrency?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_CONCURRENCY = 8;

export function isBrokenHealth(result: LinkHealthResult): boolean {
  return result.status === 'error' || result.status >= 400;
}

function webUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return isSafeExternalUrl(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function statusMessage(response: Response): string {
  return response.statusText ? `${response.status} ${response.statusText}` : `HTTP ${response.status}`;
}

async function requestOnce(
  url: string,
  method: 'HEAD' | 'GET',
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  try {
    return await fetch(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

/**
 * Checks one link without downloading the page: HEAD first, GET when the server
 * rejects HEAD, following only same-scheme redirects. Network failures are
 * returned as results rather than thrown, except when the caller cancels.
 */
export async function checkLinkHealth(
  target: LinkHealthTarget,
  options: Pick<LinkHealthOptions, 'signal' | 'timeoutMs'> = {},
): Promise<LinkHealthResult> {
  const checkedAt = new Date().toISOString();
  const fail = (message: string, permanent = false): LinkHealthResult => ({
    id: target.id,
    status: 'error',
    finalUrl: null,
    checkedAt,
    permanent,
    message,
  });

  const initial = webUrl(target.url);
  if (!initial) return fail('Not a supported web address', true);

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let current = initial;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await requestOnce(current, 'HEAD', options.signal, timeoutMs);
      if (response.status === 405 || response.status === 501) {
        cancelBody(response);
        response = await requestOnce(current, 'GET', options.signal, timeoutMs);
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return fail('Could not reach the page');
    }

    if (REDIRECT_CODES.has(response.status)) {
      const location = response.headers.get('location');
      cancelBody(response);
      if (!location) return fail('The page redirected without a destination');
      let next: string | null = null;
      try {
        next = webUrl(new URL(location, current).href);
      } catch {
        next = null;
      }
      if (!next) return fail('The page redirected to an unsafe address', true);
      current = next;
      continue;
    }

    cancelBody(response);
    return {
      id: target.id,
      status: response.status,
      finalUrl: current,
      checkedAt,
      permanent: response.status === 404 || response.status === 410,
      message: statusMessage(response),
    };
  }
  return fail('Too many redirects');
}

/** Checks links in batches so a long library does not open hundreds of sockets. */
export async function checkLinks(
  targets: LinkHealthTarget[],
  options: LinkHealthOptions = {},
): Promise<LinkHealthResult[]> {
  const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, options.concurrency ?? 4));
  const results: LinkHealthResult[] = [];
  for (let index = 0; index < targets.length; index += concurrency) {
    if (options.signal?.aborted) break;
    const batch = targets.slice(index, index + concurrency);
    const settled = await Promise.allSettled(batch.map((target) => checkLinkHealth(target, options)));
    for (const outcome of settled) if (outcome.status === 'fulfilled') results.push(outcome.value);
    if (options.signal?.aborted) break;
  }
  return results;
}
