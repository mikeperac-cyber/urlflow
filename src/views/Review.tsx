import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  ExternalLink,
  GitMerge,
  SkipForward,
  Target,
} from 'lucide-react';
import type { ReviewEntry } from '../../shared/review';
import { useApp } from '../app-context';
import { Button, EmptyState, KindIcon } from '../components/ui';
import { fromInputValue, tomorrowAt } from '../lib/dates';

const KIND_LABEL: Record<ReviewEntry['kind'], string> = {
  'overdue-task': 'Overdue task',
  'stale-link': 'Link gone quiet',
  'stalled-plan': 'Plan stalled',
  duplicates: 'Duplicates to merge',
};

export function ReviewView() {
  const { reviewQueue, archivedItems, matches, state, api, run, openEditor, navigate, archiveItem } = useApp();
  const [skipped, setSkipped] = useState<string[]>([]);

  const remaining = useMemo(
    () => reviewQueue.filter((entry) => !skipped.includes(entry.key)),
    [reviewQueue, skipped],
  );
  const current = remaining[0];
  const item = current?.itemId ? state.items.find((entry) => entry.id === current.itemId) : undefined;
  const reviewed = reviewQueue.length - remaining.length;

  const counts = useMemo(
    () => ({
      overdue: reviewQueue.filter((entry) => entry.kind === 'overdue-task').length,
      stale: reviewQueue.filter((entry) => entry.kind === 'stale-link').length,
      stalled: reviewQueue.filter((entry) => entry.kind === 'stalled-plan').length,
      duplicates: matches.duplicates.length,
    }),
    [reviewQueue, matches.duplicates.length],
  );

  if (!current) {
    return (
      <div className="stack">
        <section className="review-hero">
          <div className="review-hero__icon">
            <ClipboardCheck size={22} />
          </div>
          <div>
            <h2>Everything is looked after</h2>
            <p>
              {reviewQueue.length === 0
                ? 'Nothing needs a decision right now. Overdue tasks, quiet links and stalled plans appear here when they need attention.'
                : 'You cleared this review. The next queue is ready whenever you are.'}
            </p>
          </div>
          <Button variant="subtle" icon={<ArrowRight size={14} />} onClick={() => navigate('dashboard')}>
            Back to dashboard
          </Button>
        </section>
        <EmptyState
          icon={<ClipboardCheck size={22} />}
          title="Nothing to review"
          hint="A clean workspace. Add a few links and plans, and this screen will surface what has gone quiet."
          action={
            <Button variant="primary" onClick={() => openEditor({ kind: 'link' })}>
              Save a link
            </Button>
          }
        />
      </div>
    );
  }

  const skip = () => setSkipped((entries) => [...entries, current.key]);
  const keep = async () => {
    if (current.itemId) {
      await run(api.markReviewed(current.itemId), { success: 'Kept for another month' });
    } else {
      skip();
    }
  };

  return (
    <div className="stack">
      <section className="review-hero">
        <div className="review-hero__icon">
          <ClipboardCheck size={22} />
        </div>
        <div>
          <h2>Weekly review</h2>
          <p>
            {reviewQueue.length} {reviewQueue.length === 1 ? 'item needs' : 'items need'} a decision.{' '}
            {reviewed > 0 ? `${reviewed} already handled.` : 'Go one at a time.'}
          </p>
        </div>
        <div className="review-hero__stats">
          <span>
            <strong>{counts.overdue}</strong> overdue
          </span>
          <span>
            <strong>{counts.stale}</strong> quiet links
          </span>
          <span>
            <strong>{counts.stalled}</strong> stalled
          </span>
          <span>
            <strong>{counts.duplicates}</strong> duplicate groups
          </span>
        </div>
      </section>

      <section className="review-card">
        <header className="review-card__head">
          <div className="review-card__kind">
            {current.kind === 'duplicates' ? (
              <span className="review-card__badge">
                <GitMerge size={14} /> {KIND_LABEL[current.kind]}
              </span>
            ) : (
              <span className="review-card__badge">
                {item ? <KindIcon kind={item.kind} size={13} /> : null} {KIND_LABEL[current.kind]}
              </span>
            )}
            <span className="review-card__progress">
              {remaining.length} left · {Math.min(reviewed + 1, reviewQueue.length)} of {reviewQueue.length}
            </span>
          </div>
          <button type="button" className="text-link" onClick={skip}>
            <SkipForward size={13} /> Skip for now
          </button>
        </header>

        <div className="review-card__body">
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
          {item && item.kind === 'link' ? (
            <span className="review-card__meta">{item.url}</span>
          ) : null}
          {item && item.kind === 'plan' ? (
            <span className="review-card__meta">
              {item.steps.filter((step) => step.done).length} of {item.steps.length} steps complete
              {item.targetDate ? ' · target set' : ''}
            </span>
          ) : null}
          {item && item.kind === 'task' && item.dueAt ? (
            <span className="review-card__meta">Due {new Date(item.dueAt).toLocaleString()}</span>
          ) : null}
        </div>

        <footer className="review-card__actions">
          {current.kind === 'overdue-task' && item && item.kind === 'task' ? (
            <>
              <Button
                variant="primary"
                icon={<Check size={14} />}
                onClick={() =>
                  void run(api.update(item.id, { done: true }), { success: 'Task completed' })
                }
              >
                Mark done
              </Button>
              <Button
                variant="subtle"
                icon={<CalendarClock size={14} />}
                onClick={() => {
                  const target = fromInputValue(tomorrowAt(9));
                  if (!target) return;
                  void run(api.update(item.id, { dueAt: target }), { success: 'Moved to tomorrow' });
                }}
              >
                Tomorrow
              </Button>
              <Button variant="ghost" onClick={() => openEditor({ kind: 'task', item })}>
                Open task
              </Button>
            </>
          ) : null}

          {current.kind === 'stale-link' && item && item.kind === 'link' ? (
            <>
              <Button
                variant="primary"
                icon={<ExternalLink size={14} />}
                onClick={() => {
                  void run(api.openLink(item.id), { success: 'Opened in your browser' });
                  void run(api.markReviewed(item.id));
                }}
              >
                Open link
              </Button>
              <Button variant="ghost" onClick={() => openEditor({ kind: 'link', item })}>
                Edit
              </Button>
            </>
          ) : null}

          {current.kind === 'stalled-plan' && item && item.kind === 'plan' ? (
            <>
              <Button variant="primary" icon={<Target size={14} />} onClick={() => navigate('plan', item.id)}>
                Open plan
              </Button>
              <Button variant="ghost" onClick={() => openEditor({ kind: 'plan', item })}>
                Edit plan
              </Button>
            </>
          ) : null}

          {current.kind === 'duplicates' ? (
            <Button variant="primary" icon={<GitMerge size={14} />} onClick={() => navigate('matches')}>
              Review matches
            </Button>
          ) : null}

          {current.itemId ? (
            <Button
              variant="subtle"
              icon={<Archive size={14} />}
              onClick={() => void archiveItem(current.itemId as string, 'Archived from review')}
            >
              Archive
            </Button>
          ) : null}
          <span className="modal__spacer" />
          <Button variant="ghost" onClick={() => void keep()}>
            Keep
          </Button>
        </footer>
      </section>

      <p className="list-footnote">
        “Keep” hides an item from review for a month. Archived items stay in the Archive ({archivedItems.length}{' '}
        saved) and can be restored with Undo.
      </p>
    </div>
  );
}
