import { describe, expect, it } from 'vitest';
import { bulkTriageLinks, createItem, ignoreMatch, normalizeState } from '../../shared/core';
import { emptyState, type AppState, type LinkItem, type Reminder } from '../../shared/types';

const before = '2026-10-29T09:00:00.000Z';
const now = new Date('2026-10-30T12:00:00.000Z');

function link(id: string, patch: Partial<LinkItem> = {}): LinkItem {
  return {
    id, kind: 'link', title: `Page ${id}`, notes: 'Keep these notes',
    tags: ['Research'], planId: null, archivedAt: null, reviewedAt: before,
    createdAt: before, updatedAt: before, readingState: 'later',
    url: `https://example.com/${id}`, favorite: true, lastOpenedAt: before,
    description: 'Page description', siteName: 'Example', faviconKey: 'a'.repeat(64),
    ...patch,
  };
}

function fixture(): AppState {
  let state = emptyState();
  for (const kind of ['plan', 'task', 'note'] as const) {
    state = createItem(state, { kind, title: kind, tags: ['Original'] }).state;
  }
  return { ...state, items: [link('a'), link('b'), link('archived', { archivedAt: before }), ...state.items] };
}

function reminder(itemId: string): Reminder {
  return { id: `reminder-${itemId}`, itemId, text: 'Remember', remindAt: before, notifiedAt: null, createdAt: before, repeat: 'none' };
}

describe('bulk link triage', () => {
  it('addsTagsWithoutReplacingExistingAndDeduplicatesIds', () => {
    const state = fixture();
    const original = structuredClone(state);
    const ids = ['a', 'a', 'missing', 'archived', ...state.items.filter((item) => item.kind !== 'link').map((item) => item.id)];
    const next = bulkTriageLinks(state, ids, { type: 'add-tags', tags: [' research ', '#New', 'new', ' Other ', ''] }, now);

    expect(next.items[0]).toEqual({ ...state.items[0], tags: ['Research', 'New', 'Other'], updatedAt: '2026-10-30T12:00:00.000Z' });
    expect(next.items.slice(1)).toEqual(state.items.slice(1));
    expect(next.reminders).toEqual(state.reminders);
    expect(next.ignoredMatches).toEqual(state.ignoredMatches);
    expect(state).toEqual(original);
  });

  it('assignsOrClearsPlanAndRejectsUnknown', () => {
    const state = fixture();
    const original = structuredClone(state);
    const plan = state.items.find((item) => item.kind === 'plan')!;
    const assigned = bulkTriageLinks(state, ['a', 'b', 'archived', plan.id], { type: 'assign-plan', planId: plan.id }, now);
    expect(assigned.items.slice(0, 2)).toEqual(state.items.slice(0, 2).map((item) => ({ ...item, planId: plan.id, updatedAt: '2026-10-30T12:00:00.000Z' })));
    expect(assigned.items.slice(2)).toEqual(state.items.slice(2));

    const cleared = bulkTriageLinks(assigned, ['a'], { type: 'assign-plan', planId: null }, now);
    expect(cleared.items[0]).toMatchObject({ planId: null });
    expect(cleared.items.slice(1)).toEqual(assigned.items.slice(1));
    for (const planId of ['missing', 'a', '']) {
      expect(() => bulkTriageLinks(state, ['a'], { type: 'assign-plan', planId }, now)).toThrow();
    }
    expect(state).toEqual(original);
  });

  it('ignoresEveryPairInGroup', () => {
    const state = { ...fixture(), ignoredMatches: ['a|b', 'other|pair'] };
    const original = structuredClone(state);
    // Selecting a has already expanded its three-member group into all three pairs.
    const next = bulkTriageLinks(state, ['a', 'a'], { type: 'ignore-matches', keys: ['a|b', 'a|c', 'b|c', 'a|c'] }, now);
    expect(next.ignoredMatches).toEqual(['a|b', 'other|pair', 'a|c', 'b|c']);
    expect(next.items).toEqual(state.items);
    expect(next.reminders).toEqual(state.reminders);
    expect(state).toEqual(original);
  });

  it('archivesTwoHundredLinks', () => {
    const selected = Array.from({ length: 200 }, (_, index) => link(`selected-${index}`));
    const state = fixture();
    state.items = [...selected, ...state.items];
    state.reminders = [reminder('selected-0'), reminder('selected-199'), reminder('a'), reminder(state.items.at(-1)!.id)];
    const original = structuredClone(state);
    const ids = [...selected.map((item) => item.id), 'selected-0', 'missing', 'archived', ...state.items.filter((item) => item.kind !== 'link').map((item) => item.id)];
    const next = bulkTriageLinks(state, ids, { type: 'archive' }, now);

    expect(next.items.slice(0, 200)).toHaveLength(200);
    for (const [index, item] of next.items.slice(0, 200).entries()) {
      expect(item).toEqual({ ...selected[index], archivedAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z' });
    }
    expect(next.items.slice(200)).toEqual(state.items.slice(200));
    expect(next.reminders).toEqual(state.reminders.slice(2));
    expect(next.ignoredMatches).toEqual(state.ignoredMatches);
    expect(state).toEqual(original);
  });

  it('preservesEveryIgnoredPairFromTwoHundredLinksThroughReload', () => {
    const links = Array.from({ length: 200 }, (_, index) => link(`group-${String(index).padStart(3, '0')}`));
    const keys = links.flatMap((item, index) => links.slice(index + 1).map((other) => `${item.id}|${other.id}`));
    const state = { ...emptyState(), items: links };
    const ignored = bulkTriageLinks(state, [links[0].id], { type: 'ignore-matches', keys }, now);
    const reloaded = normalizeState(JSON.parse(JSON.stringify(ignored)));

    expect(keys).toHaveLength(19_900);
    expect(reloaded.ignoredMatches).toHaveLength(19_900);
    expect(reloaded.ignoredMatches).toEqual(keys);
    expect(reloaded.items).toEqual(links);
    expect(state.ignoredMatches).toEqual([]);
  });

  it('singleIgnoreRetainsPreviouslyIgnoredPairsAboveFiveHundred', () => {
    const keys = Array.from({ length: 600 }, (_, index) => `left-${index}|right-${index}`);
    const state = { ...emptyState(), ignoredMatches: keys };
    const next = ignoreMatch(state, 'new-left|new-right');

    expect(next.ignoredMatches).toHaveLength(601);
    expect(next.ignoredMatches.slice(0, 600)).toEqual(keys);
    expect(next.ignoredMatches.at(-1)).toBe('new-left|new-right');
    expect(state.ignoredMatches).toHaveLength(600);
  });

  it('ignoresStaleArchivedAndNonLinkSelections', () => {
    const state = fixture();
    const original = structuredClone(state);
    const ids = ['missing', 'archived', ...state.items.filter((item) => item.kind !== 'link').map((item) => item.id)];
    const actions = [
      { type: 'add-tags' as const, tags: ['New'] },
      { type: 'assign-plan' as const, planId: null },
      { type: 'archive' as const },
      { type: 'ignore-matches' as const, keys: ['a|b'] },
    ];
    for (const action of actions) {
      expect(bulkTriageLinks(state, ids, action, now)).toEqual(state);
      expect(bulkTriageLinks(state, [], action, now)).toEqual(state);
    }
    expect(state).toEqual(original);
  });
});
