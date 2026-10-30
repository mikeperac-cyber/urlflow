import { describe, expect, it } from 'vitest';
import { createCaptureUrl } from '../../browser-extension/captureUrl.js';

describe('createCaptureUrl', () => {
  it('encodesPageUrlAndTitle', () => {
    const pageUrl = 'https://example.com/a%20path?q=a+b&next=https%3A%2F%2Fother.test%2F#résumé';
    const title = 'A guide & tips? #1 — Türkçe + 100%';
    const capture = new URL(createCaptureUrl(pageUrl, title));
    expect(capture.protocol).toBe('urlflow:');
    expect(capture.hostname).toBe('add');
    expect(capture.searchParams.get('url')).toBe(pageUrl);
    expect(capture.searchParams.get('title')).toBe(title);
    expect([...capture.searchParams.keys()]).toEqual(['url', 'title']);
  });

  it('omitsEmptyTitle', () => {
    for (const title of [undefined, '', '   ']) {
      const capture = new URL(createCaptureUrl('https://example.com/', title));
      expect(capture.searchParams.get('url')).toBe('https://example.com/');
      expect(capture.searchParams.has('title')).toBe(false);
    }
  });
});
