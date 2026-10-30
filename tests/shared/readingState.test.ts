import { describe, expect, it } from 'vitest';
import { createItem, importBookmarks, isReadingState, mergeItems, normalizeState, updateItem } from '../../shared/core';
import { emptyState, type ItemDraft, type ItemPatch, type LinkItem, type ReadingState } from '../../shared/types';

const linkDraft: ItemDraft = {
  kind: 'link', title: 'Saved page', url: 'https://example.com/article',
  notes: 'Keep these notes', tags: ['Research'], favorite: true,
  description: 'Page description', siteName: 'Example', faviconKey: 'a'.repeat(64),
};

describe('link reading states', () => {
  it('defaultsLegacyLinksToUnread', () => {
    const created = createItem(emptyState(), linkDraft);
    const { readingState: _state, ...legacyLink } = created.state.items[0] as LinkItem;
    const backup = { ...created.state, items: [legacyLink], ignoredMatches: ['left|right'] };
    const normalized = normalizeState(JSON.parse(JSON.stringify(backup)));

    expect(normalized.items[0]).toEqual({ ...legacyLink, readingState: 'unread' });
    expect(normalized.ignoredMatches).toEqual(['left|right']);
    expect(backup.items[0]).not.toHaveProperty('readingState');
  });

  it('rejectsUnknownStateAsUnread', () => {
    const created = createItem(emptyState(), linkDraft);
    for (const readingState of ['unknown', 'READ', '', null, 1, true, {}, ['later']]) {
      const normalized = normalizeState({ ...created.state, items: [{ ...created.state.items[0], readingState }] });
      expect(normalized.items[0]).toMatchObject({ readingState: 'unread' });
    }
  });

  it('mergeKeepsMostUnfinishedReadingState', () => {
    const cases: [ReadingState, ReadingState, ReadingState][] = [
      ['unread', 'later', 'unread'], ['later', 'unread', 'unread'],
      ['unread', 'read', 'unread'], ['read', 'unread', 'unread'],
      ['later', 'read', 'later'], ['read', 'later', 'later'],
      ['read', 'read', 'read'], ['later', 'later', 'later'], ['unread', 'unread', 'unread'],
    ];
    for (const [primaryState, otherState, expected] of cases) {
      const primary = createItem(emptyState(), { ...linkDraft, readingState: primaryState });
      const other = createItem(primary.state, { ...linkDraft, readingState: otherState });
      const merged = mergeItems(other.state, primary.id, other.id);
      expect(merged.items).toHaveLength(1);
      expect(merged.items[0]).toMatchObject({ id: primary.id, readingState: expected, description: 'Page description', siteName: 'Example', faviconKey: 'a'.repeat(64) });
    }
  });

  it('defaultsNewAndImportedBookmarksToUnread', () => {
    expect(createItem(emptyState(), linkDraft).state.items[0]).toMatchObject({ readingState: 'unread' });
    const imported = importBookmarks(emptyState(), [{ url: 'https://example.com', title: 'Bookmark', folder: 'Research' }]);
    expect(imported.state.items[0]).toMatchObject({ readingState: 'unread', title: 'Bookmark', tags: ['Research'] });
  });

  it('preservesValidStatesThroughDraftsBackupsAndUnrelatedPatches', () => {
    for (const readingState of ['unread', 'later', 'read'] as const) {
      const created = createItem(emptyState(), { ...linkDraft, readingState });
      expect(created.state.items[0]).toMatchObject({ readingState });
      const normalized = normalizeState(JSON.parse(JSON.stringify(created.state)));
      expect(normalized).toEqual(created.state);
      expect(updateItem(normalized, created.id, { title: 'Edited title' }).items[0]).toMatchObject({ readingState, description: 'Page description', title: 'Edited title' });
      expect(updateItem(created.state, created.id, { readingState: 'later' }).items[0]).toMatchObject({ readingState: 'later' });
    }
  });

  it('validatesDraftAndPatchStates', () => {
    for (const readingState of ['unknown', null, 1, true, {}]) {
      const created = createItem(emptyState(), { ...linkDraft, readingState: 'read' });
      const draft = { ...linkDraft, readingState } as unknown as ItemDraft;
      expect(createItem(emptyState(), draft).state.items[0]).toMatchObject({ readingState: 'unread' });
      const patch = { readingState } as unknown as ItemPatch;
      expect(updateItem(created.state, created.id, patch).items[0]).toMatchObject({ readingState: 'unread', description: 'Page description' });
    }
  });

  it('doesNotAddReadingStateToNonLinks', () => {
    for (const kind of ['plan', 'task', 'note'] as const) {
      const created = createItem(emptyState(), { kind, title: 'Non-link', readingState: 'later' });
      expect(created.state.items[0]).not.toHaveProperty('readingState');
      expect(normalizeState(created.state).items[0]).not.toHaveProperty('readingState');
      expect(updateItem(created.state, created.id, { readingState: 'read' }).items[0]).not.toHaveProperty('readingState');
    }
  });

  it('recognizesOnlySupportedReadingStates', () => {
    for (const value of ['unread', 'later', 'read']) expect(isReadingState(value)).toBe(true);
    for (const value of [undefined, null, '', 'READ', 'unknown', 1, true, {}, ['later']]) {
      expect(isReadingState(value)).toBe(false);
    }
  });
});
