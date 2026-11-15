import { describe, expect, it } from 'vitest';
import { decodeBatchPayload } from '../../shared/batch';
import {
  buildLinksBatch,
  buildPlanBatch,
  buildTabGroupOptions,
  collectTabs,
  createBatchCaptureUrls,
  encodeBatch,
} from '../../browser-extension/tabs.js';

describe('tab batch helpers', () => {
  it('keepsOnlyWebTabsInWindowOrder', () => {
    expect(collectTabs([
      { url: 'https://a.example/1', title: ' One ' },
      { url: 'chrome://extensions', title: 'Extensions' },
      { url: 'https://a.example/1', title: 'One again' },
      { url: 'file:///C:/secret.txt', title: 'File' },
    ])).toEqual([
      { url: 'https://a.example/1', title: 'One' },
      { url: 'https://a.example/1', title: 'One again' },
    ]);
  });

  it('buildsLinksAndPlanBatches', () => {
    const entries = [{ url: 'https://a.example', title: 'A' }];
    expect(buildLinksBatch(entries, ['tabs'])).toEqual({ kind: 'links', entries, tags: ['tabs'] });
    expect(buildPlanBatch(entries, { title: ' Research ', tags: ['read'] }))
      .toEqual({ kind: 'plan', title: 'Research', entries, tags: ['read'] });
  });

  it('splitsBatchesIntoProtocolSafeUrls', () => {
    const batch = buildLinksBatch(
      Array.from({ length: 40 }, (_, index) => ({ url: `https://example.com/${index}`, title: `Tab ${index}` })),
    );
    const urls = createBatchCaptureUrls(batch, { batchId: 'abcdefgh', maxLength: 1800 });
    expect(urls.length).toBeGreaterThan(1);
    expect(urls.every((url) => url.length <= 1800 && url.startsWith('urlflow://add?batchId=abcdefgh&i='))).toBe(true);
    const indexes = urls.map((url) => Number(new URL(url).searchParams.get('i')));
    expect(indexes).toEqual([...indexes.keys()]);
  });

  it('encodesBatchesThatElectronCanDecode', () => {
    const batch = buildPlanBatch(
      [{ url: 'https://example.com/a', title: 'A' }],
      { title: 'Group', tags: ['tabs'] },
    );
    expect(decodeBatchPayload(encodeBatch(batch))).toEqual(batch);
  });

  it('groupsTabsAndFallsBackToAGeneratedTitle', () => {
    const options = buildTabGroupOptions(
      [{ url: 'https://a.example', title: 'A', groupId: 7 }],
      [{ id: 7, title: '' }],
    );
    expect(options).toEqual([
      { id: 7, title: 'Tab group 7', entries: [{ url: 'https://a.example', title: 'A' }] },
    ]);
  });

  it('usesTheGroupTitleWhenAvailableAndSkipsUngroupedTabs', () => {
    const options = buildTabGroupOptions(
      [
        { url: 'https://a.example', title: 'A', groupId: 3 },
        { url: 'https://b.example', title: 'B', groupId: -1 },
      ],
      [{ id: 3, title: 'Research' }],
    );
    expect(options).toEqual([
      { id: 3, title: 'Research', entries: [{ url: 'https://a.example', title: 'A' }] },
    ]);
  });
});
