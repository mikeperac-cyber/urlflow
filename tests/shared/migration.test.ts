import { describe, expect, it } from 'vitest';
import { normalizeState } from '../../shared/core';
import { emptyState } from '../../shared/types';

const legacyLink = {
  id: 'l1',
  kind: 'link',
  title: 'Legacy',
  notes: 'n',
  tags: ['x'],
  planId: null,
  archivedAt: null,
  reviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  url: 'https://example.com/a',
  favorite: false,
  readingState: 'unread',
  lastOpenedAt: null,
};

describe('workspace schema migration', () => {
  it('migratesVersionOneFilesWithoutTouchingItems', () => {
    const migrated = normalizeState({
      version: 1,
      items: [legacyLink],
      reminders: [],
      ignoredMatches: [],
    });

    expect(migrated.version).toBe(2);
    expect(migrated.tagRules).toEqual([]);
    expect(migrated.planTemplates).toEqual([]);
    expect(migrated.items).toHaveLength(1);
    expect(migrated.items[0].updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(migrated.items[0].title).toBe('Legacy');
  });

  it('startsANewWorkspaceAtTheCurrentVersion', () => {
    expect(emptyState()).toMatchObject({ version: 2, tagRules: [], planTemplates: [] });
  });
});
