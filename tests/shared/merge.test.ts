import { describe, expect, it } from 'vitest';
import { createItem, mergeItems, setReminder } from '../../shared/core';
import { emptyState } from '../../shared/types';

describe('item merge integrity', () => {
  it('mergeKeepsNotesTagsAndBothReminders', () => {
    const plan = createItem(emptyState(), { kind: 'plan', title: 'Research plan' });
    const primary = createItem(plan.state, {
      kind: 'link', title: 'First page', url: 'https://example.com/first',
      notes: 'Primary notes', tags: ['Research', 'Primary'], planId: plan.id,
    });
    const other = createItem(primary.state, {
      kind: 'link', title: 'Second page', url: 'https://example.com/second',
      notes: 'Other notes', tags: ['research', 'Other'],
    });
    let state = setReminder(other.state, primary.id, '2026-11-01T09:00:00.000Z', 'First reminder');
    state = setReminder(state, other.id, '2026-11-02T09:00:00.000Z', 'Second reminder', 'weekly');
    const original = structuredClone(state);

    const merged = mergeItems(state, primary.id, other.id);
    expect(merged.items).toHaveLength(2);
    expect(merged.items.find((item) => item.id === primary.id)).toMatchObject({
      title: 'First page', notes: 'Primary notes\n\n---\n\nOther notes',
      tags: ['Research', 'Primary', 'Other'], planId: plan.id,
    });
    expect(merged.items.some((item) => item.id === other.id)).toBe(false);
    expect(merged.reminders).toEqual(state.reminders.map((reminder) => ({ ...reminder, itemId: primary.id })));
    expect(state).toEqual(original);
  });

  it('mergeRejectsMissingOrDifferentKinds', () => {
    const link = createItem(emptyState(), { kind: 'link', title: 'Page', url: 'https://example.com' });
    const note = createItem(link.state, { kind: 'note', title: 'Note' });
    const original = structuredClone(note.state);

    expect(() => mergeItems(note.state, 'missing', link.id)).toThrow('One of the items no longer exists.');
    expect(() => mergeItems(note.state, link.id, 'missing')).toThrow('One of the items no longer exists.');
    expect(() => mergeItems(note.state, link.id, note.id)).toThrow('Only items of the same type can be merged.');
    expect(note.state).toEqual(original);
  });

  it('mergeRedirectsPlanRelationships', () => {
    const primary = createItem(emptyState(), { kind: 'plan', title: 'Primary plan' });
    const other = createItem(primary.state, { kind: 'plan', title: 'Other plan' });
    const child = createItem(other.state, { kind: 'note', title: 'Attached note', planId: other.id });

    const merged = mergeItems(child.state, primary.id, other.id);
    expect(merged.items.find((item) => item.id === child.id)).toMatchObject({ planId: primary.id });
    expect(merged.items.some((item) => item.id === other.id)).toBe(false);
    expect(child.state.items.find((item) => item.id === child.id)).toMatchObject({ planId: other.id });
  });
});
