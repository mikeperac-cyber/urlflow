import { describe, expect, it } from 'vitest';
import { planLinksForLaunch } from '../../shared/planLaunch';
import { emptyState, type LinkItem } from '../../shared/types';

function link(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: 'a',
    kind: 'link',
    title: 'Link',
    notes: '',
    tags: [],
    planId: 'p1',
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.com/a',
    favorite: false,
    readingState: 'unread',
    lastOpenedAt: null,
    snapshotAt: null,
    ...overrides,
  };
}

describe('plan launch links', () => {
  it('excludesArchivedAndUnsafeLinks', () => {
    const state = {
      ...emptyState(),
      items: [
        link({ id: 'a', planId: 'p1' }),
        link({ id: 'b', planId: 'p1', archivedAt: '2026-01-01T00:00:00.000Z' }),
        link({ id: 'c', planId: 'p1', url: 'ftp://example.com/x' }),
        link({ id: 'd', planId: null }),
      ],
    };
    expect(planLinksForLaunch(state, 'p1').map((entry) => entry.id)).toEqual(['a']);
  });

  it('returnsLinksInSavedOrder', () => {
    const state = {
      ...emptyState(),
      items: [
        link({ id: 'new', createdAt: '2026-02-01T00:00:00.000Z' }),
        link({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      ],
    };
    expect(planLinksForLaunch(state, 'p1').map((entry) => entry.id)).toEqual(['old', 'new']);
  });
});
