import { describe, expect, it } from 'vitest';
import { dueReminders, nextReminderTime } from '../../shared/core';
import { emptyState, type Reminder } from '../../shared/types';

function reminder(id: string, remindAt: string, notifiedAt: string | null = null): Reminder {
  return { id, itemId: 'item', text: id, remindAt, notifiedAt, createdAt: '2026-01-01T00:00:00.000Z', repeat: 'none' };
}

describe('reminder scheduling', () => {
  it('dueReminderIncludesExactBoundary', () => {
    const now = new Date('2026-01-29T09:00:00.000Z');
    const state = {
      ...emptyState(),
      reminders: [
        reminder('past', '2026-01-29T08:59:59.999Z'),
        reminder('exact', now.toISOString()),
        reminder('future', '2026-01-29T09:00:00.001Z'),
        reminder('notified', now.toISOString(), '2026-01-29T09:00:00.000Z'),
        reminder('invalid', 'not a date'),
      ],
    };
    const original = structuredClone(state);

    expect(dueReminders(state, now).map((entry) => entry.id)).toEqual(['past', 'exact']);
    expect(state).toEqual(original);
  });

  it('repeatAdvancesPastMissedIntervals', () => {
    const from = new Date('2026-01-01T09:00:00.000Z');
    const now = new Date('2026-01-29T09:00:00.000Z');
    const next = nextReminderTime(from, 'weekly', now);

    expect(next.toISOString()).toBe('2026-02-05T09:00:00.000Z');
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(from.toISOString()).toBe('2026-01-01T09:00:00.000Z');
    expect(nextReminderTime(from, 'none', now)).toEqual(from);
  });
});
