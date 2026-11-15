import { describe, expect, it } from 'vitest';
import { cleanTags } from '../../shared/tags';
import { normalizeTagRules, ruleMatches, tagsForUrl } from '../../shared/tagRules';
import type { TagRule } from '../../shared/types';

function rule(overrides: Partial<TagRule> = {}): TagRule {
  return {
    id: 'r1',
    pattern: 'example.com',
    matchType: 'domain',
    tags: ['code'],
    enabled: true,
    ...overrides,
  };
}

describe('auto-tag rules', () => {
  it('matchesDomainRulesOnSubdomains', () => {
    expect(tagsForUrl('https://gist.github.com/a', [
      rule({ pattern: 'https://www.github.com/', matchType: 'domain', tags: ['code'] }),
    ])).toEqual(['code']);
  });

  it('doesNotMatchUnrelatedDomainsOrDisabledRules', () => {
    expect(tagsForUrl('https://notexample.com/a', [rule()])).toEqual([]);
    expect(tagsForUrl('https://example.com/a', [rule({ enabled: false })])).toEqual([]);
  });

  it('skipsInvalidRegexWithoutThrowing', () => {
    expect(tagsForUrl('https://example.com/a', [rule({ pattern: '([', matchType: 'regex', tags: ['bad'] })])).toEqual([]);
  });

  it('mergesRuleTagsWithUserTagsWithoutDuplicates', () => {
    const ruleTags = tagsForUrl('https://docs.example.com', [rule({ tags: ['docs', 'reading'] })]);
    expect(cleanTags(['Docs', ...ruleTags])).toEqual(['Docs', 'reading']);
  });

  it('dropsMalformedRulesAndCapsTheList', () => {
    expect(normalizeTagRules([
      null,
      { pattern: '', tags: ['x'] },
      { pattern: 'example.com', tags: [] },
      { pattern: 'example.com', matchType: 'regex', tags: ['keep'], enabled: false },
      'nope',
    ])).toEqual([{ id: expect.any(String), pattern: 'example.com', matchType: 'regex', tags: ['keep'], enabled: false }]);
    expect(normalizeTagRules(Array.from({ length: 150 }, (_, i) => rule({ id: `r${i}` })))).toHaveLength(100);
  });

  it('matchesRegexAgainstTheWholeUrl', () => {
    expect(ruleMatches(rule({ pattern: '/docs/', matchType: 'regex', tags: [] }), 'https://example.com/docs/start')).toBe(true);
    expect(ruleMatches(rule({ pattern: '/docs/', matchType: 'regex', tags: [] }), 'https://example.com/blog')).toBe(false);
  });
});
