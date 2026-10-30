import { describe, expect, it } from 'vitest';
import { findMatches } from '../../shared/matching';
import { matchKey, type LinkItem } from '../../shared/types';

function link(id: string, url: string, title: string, archivedAt: string | null = null): LinkItem {
  return {
    id, kind: 'link', title, url, archivedAt, notes: '', tags: [], planId: null,
    createdAt: '2026-10-30T09:00:00.000Z', updatedAt: '2026-10-30T09:00:00.000Z',
    reviewedAt: null, readingState: 'unread', favorite: false, lastOpenedAt: null,
  };
}

function pairs() {
  return [
    link('a', 'https://astronomy.example.com/orbits', 'Astronomy orbit calculations'),
    link('b', 'https://astronomy.example.com/orbits', 'Astronomy orbit calculations'),
    link('c', 'https://culinary.example.net/fermentation', 'Culinary fermentation experiments'),
    link('d', 'https://culinary.example.net/fermentation', 'Culinary fermentation experiments'),
  ];
}

describe('match exclusions', () => {
  it('ignoresOnlyTheRequestedPair', () => {
    const items = pairs();
    const original = structuredClone(items);
    const matches = findMatches(items, [matchKey('b', 'a')]);

    expect(matches.duplicates.map((group) => [...group.ids].sort())).toEqual([['c', 'd']]);
    expect(matches.related).toEqual([]);
    expect(items).toEqual(original);
  });

  it('excludesArchivedItems', () => {
    const items = pairs();
    items[1].archivedAt = '2026-10-29T09:00:00.000Z';
    const matches = findMatches(items);

    expect(matches.duplicates.map((group) => [...group.ids].sort())).toEqual([['c', 'd']]);
    expect(matches.related).toEqual([]);
  });
});
