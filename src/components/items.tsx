import { useState } from 'react';
import {
  Archive,
  Bell,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Pin,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import { ITEM_KIND_LABEL, type LinkItem, type NoteItem, type PlanItem, type TaskItem } from '../../shared/types';
import { planProgress } from '../../shared/core';
import { displayUrl, faviconTone, initialsFor } from '../../shared/url';
import { useApp } from '../app-context';
import { dueInfo, formatDate, relativeTime, reminderInfo } from '../lib/dates';
import { Confirm, IconButton, Progress, TagPill } from './ui';
import { Favicon } from './Favicon';

export function PlanBadge({ planId }: { planId: string | null }) {
  const { plans, navigate } = useApp();
  if (!planId) return null;
  const plan = plans.find((entry) => entry.id === planId);
  if (!plan) return null;
  return (
    <button
      type="button"
      className="badge badge--plan"
      onClick={(event) => {
        event.stopPropagation();
        navigate('plan', plan.id);
      }}
      title={`Open plan: ${plan.title}`}
    >
      <span className="badge__dot" style={{ background: plan.color }} />
      {plan.title}
    </button>
  );
}

export function LinkCard({ link, compact = false }: { link: LinkItem; compact?: boolean }) {
  const { api, run, openEditor, plans, remindersById, pushToast, archiveItem } = useApp();
  const plan = plans.find((entry) => entry.id === link.planId);
  const reminder = remindersById.get(link.id);

  return (
    <article className="link-card" data-item-id={link.id} onClick={() => openEditor({ kind: 'link', item: link })}>
      <div className="link-card__head">
        <Favicon url={link.url} faviconKey={link.faviconKey} />
        <div className="link-card__identity">
          <h3 title={link.title}>
            <button
              type="button"
              className="card-title"
              onClick={(event) => {
                event.stopPropagation();
                openEditor({ kind: 'link', item: link });
              }}
            >
              {link.title}
            </button>
          </h3>
          {link.siteName ? <span className="link-card__site" title={link.siteName}>{link.siteName}</span> : null}
          <span className="link-card__url" title={link.url}>
            {displayUrl(link.url)}
          </span>
        </div>
        <div className="link-card__head-actions">
          {link.favorite ? <Star size={13} className="star-on" /> : null}
          <IconButton
            label="Open in browser"
            onClick={(event) => {
              event.stopPropagation();
              void run(api.openLink(link.id));
            }}
          >
            <ExternalLink size={15} />
          </IconButton>
        </div>
      </div>

      {!compact && link.description ? <p className="link-card__description">{link.description}</p> : null}
      {!compact && link.notes ? <p className="link-card__notes">{link.notes}</p> : null}

      <div className="card-tags">
        {plan ? <PlanBadge planId={plan.id} /> : null}
        {link.tags.slice(0, 4).map((tag) => (
          <TagPill key={tag}>#{tag}</TagPill>
        ))}
        {reminder ? (
          <span className="badge badge--reminder" title={reminderInfo(reminder.remindAt).absolute}>
            <Bell size={11} /> {reminderInfo(reminder.remindAt).label}
          </span>
        ) : null}
      </div>

      <footer className="card-footer">
        <span className="card-footer__meta">
          {link.lastOpenedAt ? `Opened ${relativeTime(link.lastOpenedAt)}` : `Saved ${relativeTime(link.createdAt)}`}
        </span>
        <div className="card-footer__actions">
          <IconButton
            label={link.favorite ? 'Remove favourite' : 'Add favourite'}
            onClick={(event) => {
              event.stopPropagation();
              void run(api.update(link.id, { favorite: !link.favorite }));
            }}
          >
            <Star size={14} className={link.favorite ? 'star-on' : ''} />
          </IconButton>
          <IconButton
            label="Copy address"
            onClick={(event) => {
              event.stopPropagation();
              void api
                .copyText(link.url)
                .then(() => pushToast('Address copied', 'success'))
                .catch(() => pushToast('Could not copy the address', 'error'));
            }}
          >
            <Copy size={14} />
          </IconButton>
          <IconButton
            label="Edit link"
            onClick={(event) => {
              event.stopPropagation();
              openEditor({ kind: 'link', item: link });
            }}
          >
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label="Archive link"
            onClick={(event) => {
              event.stopPropagation();
              void archiveItem(link.id, 'Link archived');
            }}
          >
            <Archive size={14} />
          </IconButton>
        </div>
      </footer>
    </article>
  );
}

export function PlanCard({ plan }: { plan: PlanItem }) {
  const { navigate, links, tasks, notes, archiveItem } = useApp();
  const progress = planProgress(plan);
  const taskCount = tasks.filter((task) => task.planId === plan.id && !task.done).length;
  const linkCount = links.filter((link) => link.planId === plan.id).length;
  const noteCount = notes.filter((note) => note.planId === plan.id).length;

  return (
    <article
      className="plan-card"
      data-item-id={plan.id}
      onClick={() => navigate('plan', plan.id)}
      style={{ ['--plan-color' as string]: plan.color }}
    >
      <div className="plan-card__stripe" />
      <div className="plan-card__head">
        <span className={`status status--${plan.status}`}>{plan.status}</span>
        {plan.targetDate ? (
          <span className="plan-card__date">
            <CalendarClock size={12} /> {formatDate(plan.targetDate)}
          </span>
        ) : null}
        <span className="plan-card__spacer" />
        <IconButton
          label="Archive plan"
          onClick={(event) => {
            event.stopPropagation();
            void archiveItem(plan.id, 'Plan archived');
          }}
        >
          <Archive size={14} />
        </IconButton>
      </div>
      <h3>
        <button
          type="button"
          className="card-title"
          onClick={(event) => {
            event.stopPropagation();
            navigate('plan', plan.id);
          }}
        >
          {plan.title}
        </button>
      </h3>
      {plan.summary ? <p className="plan-card__summary">{plan.summary}</p> : null}
      <div className="plan-card__progress">
        <Progress percent={progress.percent} color={plan.color} />
        <span>
          {progress.done}/{progress.total} steps
        </span>
      </div>
      <footer className="plan-card__footer">
        <span className="plan-card__counts">
          {taskCount > 0 ? `${taskCount} open ${taskCount === 1 ? 'task' : 'tasks'}` : 'No open tasks'}
          {linkCount > 0 ? ` · ${linkCount} ${linkCount === 1 ? 'link' : 'links'}` : ''}
          {noteCount > 0 ? ` · ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : ''}
        </span>
        <span className="plan-card__open">Open plan →</span>
      </footer>
    </article>
  );
}

export function TaskRow({ task, showPlan = true }: { task: TaskItem; showPlan?: boolean }) {
  const { api, run, openEditor, openReminder, remindersById, archiveItem } = useApp();
  const due = dueInfo(task.dueAt);
  const reminder = remindersById.get(task.id);

  return (
    <div className={`task-row ${task.done ? 'is-done' : ''}`} data-item-id={task.id}>
      <button
        type="button"
        className={`task-check ${task.done ? 'is-done' : ''}`}
        aria-label={task.done ? 'Mark task open' : 'Mark task complete'}
        onClick={() => void run(api.update(task.id, { done: !task.done }))}
      >
        {task.done ? <Check size={12} /> : null}
      </button>
      <div className="task-main">
        <button type="button" className="task-title-btn" onClick={() => openEditor({ kind: 'task', item: task })}>
          <span className="task-title">{task.title}</span>
        </button>
        <span className="task-meta">
          {task.done ? (
            task.completedAt ? <span className="due due--none">Completed {formatDate(task.completedAt)}</span> : null
          ) : task.dueAt ? (
            <span className={`due due--${due.tone}`}>{due.label}</span>
          ) : null}
          {reminder ? (
            <span className="badge badge--reminder" title={reminderInfo(reminder.remindAt).absolute}>
              <Bell size={10} /> {reminderInfo(reminder.remindAt).label}
            </span>
          ) : null}
          {showPlan ? <PlanBadge planId={task.planId} /> : null}
          {task.tags.slice(0, 2).map((tag) => (
            <TagPill key={tag}>#{tag}</TagPill>
          ))}
        </span>
      </div>
      <span className={`priority priority--${task.priority}`}>{task.priority}</span>
      <div className="task-actions">
        <IconButton
          label="Set reminder"
          onClick={() => openReminder(task)}
        >
          <Bell size={14} />
        </IconButton>
        <IconButton
          label="Archive task"
          onClick={() => void archiveItem(task.id, 'Task archived')}
        >
          <Archive size={14} />
        </IconButton>
      </div>
    </div>
  );
}

export function NoteCard({ note, compact = false }: { note: NoteItem; compact?: boolean }) {
  const { api, run, openEditor, archiveItem } = useApp();
  return (
    <article
      className={`note-card ${note.pinned ? 'is-pinned' : ''}`}
      data-item-id={note.id}
      onClick={() => openEditor({ kind: 'note', item: note })}
    >
      <header className="note-card__head">
        <h3>
          <button
            type="button"
            className="card-title"
            onClick={(event) => {
              event.stopPropagation();
              openEditor({ kind: 'note', item: note });
            }}
          >
            {note.title}
          </button>
        </h3>
        <IconButton
          label={note.pinned ? 'Unpin note' : 'Pin note'}
          onClick={(event) => {
            event.stopPropagation();
            void run(api.update(note.id, { pinned: !note.pinned }));
          }}
        >
          <Pin size={14} className={note.pinned ? 'pin-on' : ''} />
        </IconButton>
      </header>
      <p className={`note-card__body ${compact ? 'note-card__body--clamp' : ''}`}>
        {note.notes || 'No content yet.'}
      </p>
      <footer className="note-card__footer">
        <PlanBadge planId={note.planId} />
        <span className="note-card__meta">{relativeTime(note.updatedAt)}</span>
        <IconButton
          label="Archive note"
          onClick={(event) => {
            event.stopPropagation();
            void archiveItem(note.id, 'Note archived');
          }}
        >
          <Archive size={13} />
        </IconButton>
      </footer>
    </article>
  );
}

export function ArchivedRow({ item }: { item: LinkItem | PlanItem | TaskItem | NoteItem }) {
  const { api, run, openEditor, showUndoToast, restoreItem } = useApp();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const icon = item.kind === 'link' ? (
    <span className="favicon favicon--sm" style={{ background: faviconTone(item.url) }}>
      {initialsFor(displayUrl(item.url))}
    </span>
  ) : item.kind === 'plan' ? (
    <span className="kind-dot" style={{ background: item.color }} />
  ) : (
    <span className="kind-dot" style={{ background: 'var(--border-strong)' }} />
  );

  return (
    <div className="archive-row" data-item-id={item.id}>
      {icon}
      <button type="button" className="archive-row__main" onClick={() => openEditor({ kind: item.kind, item })}>
        <span className="archive-row__title">{item.title}</span>
        <span className="archive-row__meta">
          {item.kind} · archived {relativeTime(item.archivedAt)}
          {item.kind === 'link' ? ` · ${displayUrl(item.url)}` : ''}
        </span>
      </button>
      <span className="kind-label">{item.kind}</span>
      <div className="archive-row__actions">
        <button
          type="button"
          className="btn btn--subtle btn--sm"
          onClick={() => void restoreItem(item.id, 'Restored to the workspace')}
        >
          <RotateCcw size={13} /> Restore
        </button>
        <IconButton label="Delete permanently" onClick={() => setConfirmingDelete(true)}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      {confirmingDelete ? (
        <Confirm
          title="Delete permanently?"
          message={`“${item.title}” will be removed for good. You can undo it right after.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void (async () => {
              const result = await run(api.remove(item.id));
              if (result) showUndoToast(`${ITEM_KIND_LABEL[item.kind]} deleted`);
            })();
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}
