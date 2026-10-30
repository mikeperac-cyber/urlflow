import { describe, expect, it } from 'vitest';
import { openLinks } from '../../electron/openLinks';

describe('batch external link opening', () => {
  it.each(['mailto:user@example.com', 'javascript:1'])('rejectsTheRawNonHttpScheme (%s)', async (url) => {
    const attempted: string[] = [];
    const opened = await openLinks([{ id: 'unsafe', url }], (target) => { attempted.push(target); });
    expect(attempted).toEqual([]);
    expect(opened).toEqual([]);
  });

  it('opensSafeLinksAndContinuesAfterFailure', async () => {
    const attempted: string[] = [];
    const opened = await openLinks([
      { id: 'unsafe', url: 'file:///private.txt' },
      { id: 'missing' },
      { id: 'empty', url: '' },
      { id: 'first', url: 'https://example.com/first' },
      { id: 'failed', url: 'https://example.com/failed' },
      { id: 'last', url: 'http://example.com/last' },
    ], async (url) => {
      attempted.push(url);
      if (url.endsWith('/failed')) throw new Error('Opener rejected');
    });

    expect(attempted).toEqual(['https://example.com/first', 'https://example.com/failed', 'http://example.com/last']);
    expect(opened).toEqual(['first', 'last']);
  });

  it('returnsOnlySuccessfullyOpenedIds', async () => {
    const links = [
      { id: 'throws', url: 'https://example.com/throws' },
      { id: 'opened', url: 'https://example.com/opened' },
      { id: 'unsafe', url: 'javascript:alert(1)' },
    ];
    const before = structuredClone(links);
    expect(await openLinks(links, (url) => {
      if (url.endsWith('/throws')) throw new Error('Synchronous failure');
    })).toEqual(['opened']);
    expect(links).toEqual(before);
    expect(await openLinks([], () => { throw new Error('Must not open'); })).toEqual([]);
  });
});
