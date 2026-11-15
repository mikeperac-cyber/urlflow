import { describe, expect, it } from 'vitest';
import { createBatch } from '../../shared/core';
import { emptyState, type TagRule } from '../../shared/types';

function rule(overrides: Partial<TagRule> = {}): TagRule {
  return { id: 'r1', pattern: 'example.com', matchType: 'domain', tags: ['batch'], enabled: true, ...overrides };
}

describe('batch creation', () => {
  it('keepsTabOrderAndSkipsUnsafeUrls', () => {
    const result = createBatch(emptyState(), {
      kind: 'links',
      entries: [
        { url: 'https://a.example/1', title: 'One' },
        { url: 'javascript:alert(1)' },
        { url: 'https://b.example/2' },
      ],
    });

    expect(result.skipped).toBe(1);
    expect(result.ids).toHaveLength(2);
    expect(result.state.items.map((item) => item.kind === 'link' && item.url)).toEqual([
      'https://a.example/1',
      'https://b.example/2',
    ]);
  });

  it('createsPlanFirstThenLinksInTabOrder', () => {
    const result = createBatch(emptyState(), {
      kind: 'plan',
      title: 'Research tabs',
      entries: [{ url: 'https://a.example/1' }, { url: 'https://b.example/2' }],
    });

    expect(result.planId).not.toBeNull();
    expect(result.state.items[0]).toMatchObject({ kind: 'plan', title: 'Research tabs' });
    expect(result.state.items.slice(1).map((item) => item.planId)).toEqual([result.planId, result.planId]);
    expect(result.state.items.slice(1).map((item) => item.kind === 'link' && item.url)).toEqual([
      'https://a.example/1',
      'https://b.example/2',
    ]);
  });

  it('appliesUserTagsAndAutoTagRules', () => {
    const state = { ...emptyState(), tagRules: [rule()] };
    const result = createBatch(state, {
      kind: 'links',
      entries: [{ url: 'https://example.com/docs' }],
      tags: ['work'],
    });

    expect(result.state.items[0].tags).toEqual(['work', 'batch']);
  });

  it('throwsForARequestThatCannotBeRead', () => {
    expect(() => createBatch(emptyState(), { kind: 'links', entries: [] })).toThrow(
      'That browser batch could not be read.',
    );
  });
});
