import { describe, expect, it } from 'vitest';
import {
  backlinksFor,
  insertWikiLink,
  searchWikiTargets,
  tokenizeWikiLinks,
  wikiLinkMarkup,
  wikiQueryAt,
} from '../../shared/wikiLinks';
import {
  PLAN_COLORS,
  type NoteItem,
  type PlanItem,
} from '../../shared/types';

function note(overrides: Partial<NoteItem> = {}): NoteItem {
  return {
    id: 'n1',
    kind: 'note',
    title: 'Doc',
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'p1',
    kind: 'plan',
    title: 'Plan',
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    summary: '',
    status: 'active',
    targetDate: null,
    steps: [],
    color: PLAN_COLORS[0],
    pinned: false,
    scratchpad: '',
    ...overrides,
  };
}

describe('wiki links', () => {
  it('parsesResolvedAndUnresolvedTokens', () => {
    const items = [note({ id: 'n1', title: 'Doc' })];
    expect(tokenizeWikiLinks('See [[n1|The doc]] and [[missing]].', items)).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'link', id: 'n1', label: 'The doc', resolved: true },
      { type: 'text', text: ' and ' },
      { type: 'link', id: 'missing', label: 'missing', resolved: false },
      { type: 'text', text: '.' },
    ]);
  });

  it('leavesMalformedTokensAsText', () => {
    const items = [note({ id: 'n1' })];
    for (const text of ['[[bad id]]', '[[n1|line\nbreak]]', '[[n1', '[[]]', 'plain']) {
      expect(tokenizeWikiLinks(text, items), text).toEqual([{ type: 'text', text }]);
    }
    expect(tokenizeWikiLinks('', items)).toEqual([]);
  });

  it('opensSuggestionsOnlyForAnUnclosedDoubleBracket', () => {
    expect(wikiQueryAt('See [[la', 8)).toEqual({ start: 4, query: 'la' });
    expect(wikiQueryAt('See [[n1|Done]]', 15)).toBeNull();
    expect(wikiQueryAt('See [[n1]]', 10)).toBeNull();
    expect(wikiQueryAt('line [[a\nb', 10)).toBeNull();
    expect(wikiQueryAt('plain text', 5)).toBeNull();
  });

  it('insertsATokenAtTheCaret', () => {
    expect(insertWikiLink('See [[la', 8, { id: 'n1', title: 'Launch plan' } as never))
      .toEqual({ text: 'See [[n1|Launch plan]] ', caret: 23 });
    expect(insertWikiLink('No query', 3, note())).toEqual({ text: 'No query', caret: 3 });
  });

  it('buildsSafeMarkup', () => {
    expect(wikiLinkMarkup(note({ id: 'n1', title: 'A | B [draft]' }))).toBe('[[n1|A  B draft]]');
  });

  it('findsBacklinksInNotesAndPlanSummariesWithoutSelf', () => {
    const items = [
      note({ id: 'n1', title: 'Target', notes: '' }),
      note({ id: 'n2', title: 'Referrer', notes: 'About [[n1|Target]]' }),
      plan({ id: 'p1', title: 'Plan', summary: 'Uses [[n1]]', notes: '[[p1|self]]' }),
    ];
    expect(backlinksFor('n1', items).map((ref) => ref.id)).toEqual(['n2', 'p1']);
    expect(backlinksFor('p1', items)).toEqual([]);
    expect(backlinksFor('bad id', items)).toEqual([]);
  });

  it('searchesPrefixMatchesFirstAndHidesArchivedItems', () => {
    const items = [
      note({ id: 'a', title: 'The Launch plan' }),
      note({ id: 'b', title: 'Launch checklist' }),
      note({ id: 'c', title: 'Archived launch', archivedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    expect(searchWikiTargets('launch', items).map((item) => item.id)).toEqual(['b', 'a']);
    expect(searchWikiTargets('', items, 2)).toHaveLength(2);
  });
});
