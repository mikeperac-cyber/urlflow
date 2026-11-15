import { describe, expect, it } from 'vitest';
import { normalizeState, setLinkSnapshot } from '../../shared/core';
import { emptyState, PLAN_COLORS } from '../../shared/types';

const baseLink = {
  id: 'l1',
  kind: 'link',
  title: 'Cached',
  notes: '',
  tags: [],
  planId: null,
  archivedAt: null,
  reviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  url: 'https://example.com/a',
  favorite: false,
  readingState: 'unread',
  lastOpenedAt: null,
};

describe('link snapshot state', () => {
  it('defaultsLegacyLinksToNoSnapshot', () => {
    const state = normalizeState({ version: 2, items: [baseLink], reminders: [], ignoredMatches: [] });
    expect(state.items[0]).toMatchObject({ snapshotAt: null });
  });

  it('keepsAStoredSnapshotTimestamp', () => {
    const state = normalizeState({
      version: 2,
      items: [{ ...baseLink, snapshotAt: '2026-11-01T10:00:00.000Z' }],
      reminders: [],
      ignoredMatches: [],
    });
    expect(state.items[0]).toMatchObject({ snapshotAt: '2026-11-01T10:00:00.000Z' });
  });

  it('setsAndClearsTheSnapshotOnLinksOnly', () => {
    const state = {
      ...emptyState(),
      items: [
        { ...baseLink, snapshotAt: null },
        {
          id: 'p1', kind: 'plan' as const, title: 'Plan', notes: '', tags: [], planId: null,
          archivedAt: null, reviewedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z', summary: '', status: 'active' as const,
          targetDate: null, steps: [], color: PLAN_COLORS[0], pinned: false, scratchpad: '',
        },
      ],
    };
    const saved = setLinkSnapshot(state, 'l1', '2026-11-02T10:00:00.000Z');
    expect(saved.items[0]).toMatchObject({ snapshotAt: '2026-11-02T10:00:00.000Z' });
    const cleared = setLinkSnapshot(saved, 'l1', null);
    expect(cleared.items[0]).toMatchObject({ snapshotAt: null });
    expect(setLinkSnapshot(cleared, 'p1', '2026-11-02T10:00:00.000Z').items[1]).toEqual(state.items[1]);
  });
});
