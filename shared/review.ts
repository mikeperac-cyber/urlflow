import type { MatchResult } from './matching';
import type { AppState } from './types';

export type ReviewKind = 'overdue-task' | 'stale-link' | 'stalled-plan' | 'duplicates';

export interface ReviewEntry {
  key: string;
  kind: ReviewKind;
  itemId?: string;
  title: string;
  detail: string;
  ageDays: number;
}

const DAY = 86_400_000;
const REVIEW_COOLDOWN = 30 * DAY;
const STALE_AFTER = 30 * DAY;
const STALLED_AFTER = 21 * DAY;

function startOfDay(now: Date): number {
  const copy = new Date(now);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function daysSince(value: string | null | undefined, now: Date): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now.getTime() - time) / DAY));
}

/** Items looked at in the last review pass stay out of the queue for a month. */
export function isRecentlyReviewed(reviewedAt: string | null | undefined, now: Date): boolean {
  if (!reviewedAt) return false;
  const time = new Date(reviewedAt).getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time < REVIEW_COOLDOWN;
}

/**
 * Builds the weekly review queue: overdue tasks, links that have gone cold,
 * plans that have stopped moving, and pending duplicate groups.
 */
export function buildReviewQueue(
  state: AppState,
  matches: Pick<MatchResult, 'duplicates'>,
  now: Date = new Date(),
): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  const today = startOfDay(now);

  for (const item of state.items) {
    if (item.archivedAt) continue;
    if (isRecentlyReviewed(item.reviewedAt, now)) continue;

    if (item.kind === 'task' && !item.done && item.dueAt) {
      const due = new Date(item.dueAt).getTime();
      if (Number.isFinite(due) && due < today) {
        const late = Math.max(1, Math.floor((today - due) / DAY) + 1);
        entries.push({
          key: `task:${item.id}`,
          kind: 'overdue-task',
          itemId: item.id,
          title: item.title,
          detail: late === 1 ? 'Due yesterday and still open.' : `Overdue by ${late} days.`,
          ageDays: late,
        });
      }
    }

    if (item.kind === 'link' && (item.readingState === 'unread' || item.readingState === 'later')) {
      const reference = item.lastOpenedAt ?? item.createdAt;
      const age = now.getTime() - new Date(reference).getTime();
      if (Number.isFinite(age) && age >= STALE_AFTER) {
        entries.push({
          key: `link:${item.id}`,
          kind: 'stale-link',
          itemId: item.id,
          title: item.title,
          detail: item.lastOpenedAt
            ? `Not opened in ${daysSince(item.lastOpenedAt, now)} days.`
            : `Saved ${daysSince(item.createdAt, now)} days ago and never opened.`,
          ageDays: daysSince(reference, now),
        });
      }
    }

    if (item.kind === 'plan' && item.status === 'active') {
      const age = now.getTime() - new Date(item.updatedAt).getTime();
      if (Number.isFinite(age) && age >= STALLED_AFTER) {
        entries.push({
          key: `plan:${item.id}`,
          kind: 'stalled-plan',
          itemId: item.id,
          title: item.title,
          detail: `No changes in ${daysSince(item.updatedAt, now)} days.`,
          ageDays: daysSince(item.updatedAt, now),
        });
      }
    }
  }

  if (matches.duplicates.length > 0) {
    const groups = matches.duplicates.length;
    entries.push({
      key: 'duplicates',
      kind: 'duplicates',
      title: `${groups} duplicate ${groups === 1 ? 'group' : 'groups'}`,
      detail: 'Merge repeated links, tasks or notes so only one copy survives.',
      ageDays: 0,
    });
  }

  const order: Record<ReviewKind, number> = {
    'overdue-task': 0,
    'stalled-plan': 1,
    'stale-link': 2,
    duplicates: 3,
  };
  return entries.sort(
    (a, b) => order[a.kind] - order[b.kind] || b.ageDays - a.ageDays || a.title.localeCompare(b.title),
  );
}
