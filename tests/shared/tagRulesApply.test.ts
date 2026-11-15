import { describe, expect, it } from 'vitest';
import { createItem, importBookmarks } from '../../shared/core';
import { emptyState, type TagRule } from '../../shared/types';

function rule(overrides: Partial<TagRule> = {}): TagRule {
  return {
    id: 'r1',
    pattern: 'github.com',
    matchType: 'domain',
    tags: ['code'],
    enabled: true,
    ...overrides,
  };
}

describe('auto-tag application', () => {
  it('appliesRuleTagsToCapturedLinks', () => {
    const state = { ...emptyState(), tagRules: [rule()] };
    const { state: next } = createItem(state, {
      kind: 'link',
      title: 'Repo',
      url: 'https://github.com/a/b',
      tags: ['work'],
    });

    expect(next.items[0].tags).toEqual(['work', 'code']);
  });

  it('appliesRuleTagsToImportedBookmarks', () => {
    const state = { ...emptyState(), tagRules: [rule({ pattern: '/news/', matchType: 'regex', tags: ['daily'] })] };
    const result = importBookmarks(
      state,
      [{ url: 'https://example.com/news/1', title: 'One', folder: '' }],
      false,
    );

    expect(result.state.items[0].tags).toEqual(['daily']);
  });

  it('keepsUserTagsWhenNoRuleMatches', () => {
    const { state: next } = createItem({ ...emptyState(), tagRules: [rule()] }, {
      kind: 'link',
      title: 'Other',
      url: 'https://example.org/a',
      tags: ['reading'],
    });

    expect(next.items[0].tags).toEqual(['reading']);
  });
});
