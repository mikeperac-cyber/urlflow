import { useEffect, useRef, useState } from 'react';
import type { FlowApi, LinkMetadata } from '../../shared/types';
import { isSafeExternalUrl, normalizeUrl } from '../../shared/url';

export function usePageMetadata(url: string, fetchMetadata: FlowApi['fetchMetadata']) {
  const normalized = normalizeUrl(url).url;
  const target = normalized && isSafeExternalUrl(normalized) ? normalized : '';
  const generation = useRef(0);
  const [result, setResult] = useState<{ url: string; metadata: LinkMetadata | null; fetching: boolean }>({
    url: '', metadata: null, fetching: false,
  });

  useEffect(() => {
    const request = ++generation.current;
    if (!target) {
      setResult({ url: '', metadata: null, fetching: false });
      return;
    }
    setResult({ url: target, metadata: null, fetching: true });
    const timer = window.setTimeout(async () => {
      let metadata: LinkMetadata | null = null;
      try { metadata = await fetchMetadata(target); } catch { /* Saving remains available offline. */ }
      if (generation.current === request) setResult({ url: target, metadata, fetching: false });
    }, 400);
    return () => {
      ++generation.current;
      window.clearTimeout(timer);
    };
  }, [target, fetchMetadata]);

  // Gate on the current URL during render as well as on response completion.
  return result.url === target
    ? { metadata: result.metadata, fetching: result.fetching }
    : { metadata: null, fetching: Boolean(target) };
}
