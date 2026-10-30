import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, normalizeUrl } from '../../shared/url';

describe('URL normalization and external opening', () => {
  it('removesTrackingParametersAndSortsQuery', () => {
    expect(normalizeUrl('https://www.Example.com/a/?b=2&utm_source=mail&a=1#section')).toEqual({
      url: 'https://example.com/a?a=1&b=2',
      key: 'https://example.com/a?a=1&b=2',
    });
  });

  it('rejectsUnsafeExternalProtocols', () => {
    for (const url of ['javascript:alert(1)', 'javascript:1', 'mailto:user@example.com', 'file:///private.txt', 'data:text/html,test', 'ftp://example.com/file']) {
      expect.soft(isSafeExternalUrl(url), url).toBe(false);
    }
    expect(isSafeExternalUrl('https://example.com/article')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/article')).toBe(true);
  });

  it('normalizesBareHostsBeforeExternalOpening', () => {
    const normalized = normalizeUrl('example.com/docs/');
    expect(normalized.url).toBe('https://example.com/docs');
    expect(isSafeExternalUrl(normalized.url)).toBe(true);
  });

  it('preservesMalformedInputWithoutTreatingItAsSafe', () => {
    expect(normalizeUrl('')).toEqual({ url: '', key: '' });
    expect(normalizeUrl('https://[broken')).toEqual({ url: 'https://[broken', key: 'https://[broken' });
    expect(isSafeExternalUrl('https://[broken')).toBe(false);
  });
});
