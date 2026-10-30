import { afterEach, describe, expect, it, vi } from 'vitest';
import { markReviewed } from '../../shared/core';
import { buildReviewQueue } from '../../shared/review';
import { emptyState, type LinkItem, type ReadingState } from '../../shared/types';

const now = new Date('2026-10-30T12:00:00.000Z');
const stale = '2026-09-01T12:00:00.000Z';

afterEach(() => vi.useRealTimers());

function link(id: string, readingState: ReadingState, patch: Partial<LinkItem> = {}): LinkItem {
  return {
    id, kind: 'link', title: id, url: `https://example.com/${id}`, readingState,
    notes: '', tags: [], planId: null, archivedAt: null, reviewedAt: null,
    createdAt: stale, updatedAt: stale, lastOpenedAt: null, favorite: false, ...patch,
  };
}

describe('reading intent in stale review', () => {
  it('staleReviewIncludesUnreadAndLaterButNotRead', () => {
    const state = { ...emptyState(), items: [
      link('stale-unread', 'unread'),
      link('stale-later', 'later', { lastOpenedAt: stale }),
      link('stale-read', 'read'),
      link('fresh-unread', 'unread', { createdAt: '2026-10-29T12:00:00.000Z' }),
      link('fresh-later', 'later', { lastOpenedAt: '2026-10-29T12:00:00.000Z' }),
      link('fresh-read', 'read', { createdAt: '2026-10-29T12:00:00.000Z' }),
    ] };

    const queue = buildReviewQueue(state, { duplicates: [] }, now);

    expect(queue.map((entry) => [entry.kind, entry.itemId])).toEqual([
      ['stale-link', 'stale-later'], ['stale-link', 'stale-unread'],
    ]);
  });

  it('keepPreservesReadingIntentAndHidesLinksForThirtyDays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    for (const readingState of ['unread', 'later'] as const) {
      const state = { ...emptyState(), items: [link('kept', readingState)] };
      const reviewed = markReviewed(state, 'kept');

      expect(reviewed.items[0]).toMatchObject({ readingState, lastOpenedAt: null, reviewedAt: now.toISOString() });
      expect(buildReviewQueue(reviewed, { duplicates: [] }, new Date('2026-11-29T11:59:59.999Z'))).toEqual([]);
      expect(buildReviewQueue(reviewed, { duplicates: [] }, new Date('2026-11-29T12:00:00.000Z')))
        .toMatchObject([{ kind: 'stale-link', itemId: 'kept' }]);
    }
  });
});
