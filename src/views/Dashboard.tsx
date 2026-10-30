import type { ReactNode } from 'react';
import {
  Bell,
  CheckSquare,
  ClipboardCheck,
  Clock,
  GitMerge,
  Link2,
  NotebookPen,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react';
import { useApp } from '../app-context';
import { LinkCard, PlanCard, TaskRow } from '../components/items';
import { Button, EmptyState } from '../components/ui';
import { isDueToday, reminderInfo, todayHeading } from '../lib/dates';

export function Dashboard() {
  const { links, plans, tasks, notes, state, matches, reviewQueue, navigate, openEditor, run, api } = useApp();

  const openTasks = tasks.filter((task) => !task.done);
  const focusTasks = openTasks
    .filter((task) => isDueToday(task.dueAt))
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const upcomingTasks = openTasks
    .filter((task) => task.dueAt && !isDueToday(task.dueAt))
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    .slice(0, 3);
  const focusList = focusTasks.length > 0 ? focusTasks.slice(0, 6) : upcomingTasks;

  const upcomingReminders = state.reminders
    .filter((reminder) => !reminder.notifiedAt)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
    .slice(0, 4);

  const activePlans = plans
    .filter((plan) => plan.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 2);

  const recentLinks = [...links].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const dueCount = focusTasks.length;
  const hourly = new Date().getHours();
  const greeting = hourly < 12 ? 'Good morning' : hourly < 18 ? 'Good afternoon' : 'Good evening';
  const isEmpty = state.items.length === 0;

  if (isEmpty) {
    return <Welcome />;
  }

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero__text">
          <span className="hero__eyebrow">{todayHeading()}</span>
          <h2>{greeting} — here is your flow.</h2>
          <p>
            {openTasks.length} open {openTasks.length === 1 ? 'task' : 'tasks'}, {upcomingReminders.length}{' '}
            {upcomingReminders.length === 1 ? 'reminder' : 'reminders'} coming up and {links.length} saved{' '}
            {links.length === 1 ? 'link' : 'links'}.
          </p>
        </div>
        <div className="hero__actions">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => openEditor({ kind: 'link' })}>
            Save a link
          </Button>
          <Button variant="subtle" icon={<Target size={15} />} onClick={() => openEditor({ kind: 'plan' })}>
            New plan
          </Button>
        </div>
      </section>

      <section className="stats">
        <StatTile label="Links saved" value={links.length} icon={<Link2 size={16} />} onClick={() => navigate('links')} />
        <StatTile
          label="Active plans"
          value={plans.filter((plan) => plan.status === 'active').length}
          icon={<Target size={16} />}
          onClick={() => navigate('plans')}
        />
        <StatTile
          label="Open tasks"
          value={openTasks.length}
          icon={<CheckSquare size={16} />}
          onClick={() => navigate('tasks')}
        />
        <StatTile
          label="Due today"
          value={dueCount}
          icon={<Clock size={16} />}
          tone={dueCount > 0 ? 'warn' : undefined}
          onClick={() => navigate('tasks')}
        />
      </section>

      {reviewQueue.length > 0 ? (
        <button type="button" className="callout callout--review" onClick={() => navigate('review')}>
          <span className="callout__icon">
            <ClipboardCheck size={17} />
          </span>
          <span>
            <strong>
              {reviewQueue.length} {reviewQueue.length === 1 ? 'item needs' : 'items need'} a decision
            </strong>
            <span>Weekly review catches overdue tasks, quiet links and plans that stopped moving.</span>
          </span>
          <span className="callout__cta">Start review →</span>
        </button>
      ) : null}

      {matches.duplicates.length > 0 ? (
        <button type="button" className="callout" onClick={() => navigate('matches')}>
          <span className="callout__icon">
            <GitMerge size={17} />
          </span>
          <span>
            <strong>
              {matches.duplicates.length} {matches.duplicates.length === 1 ? 'duplicate' : 'duplicates'} found
            </strong>
            <span>
              Merge repeated links, tasks or notes to keep your workspace clean.
              {matches.related.length > 0
                ? ` ${matches.related.length} related ${matches.related.length === 1 ? 'item' : 'items'} to review.`
                : ''}
            </span>
          </span>
          <span className="callout__cta">Review matches →</span>
        </button>
      ) : null}

      <div className="dashboard-grid">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Focus today</h3>
              <p>{focusTasks.length > 0 ? 'Tasks due today or already overdue.' : 'Next up from your task list.'}</p>
            </div>
            <button type="button" className="text-link" onClick={() => navigate('tasks')}>
              All tasks
            </button>
          </header>
          <div className="panel__body panel__body--flush">
            {focusList.length === 0 ? (
              <EmptyState
                icon={<CheckSquare size={20} />}
                title="Nothing due today"
                hint="Add a due date to a task and it will show up here."
                action={
                  <Button size="sm" variant="subtle" icon={<Plus size={13} />} onClick={() => openEditor({ kind: 'task' })}>
                    Add task
                  </Button>
                }
              />
            ) : (
              focusList.map((task) => <TaskRow key={task.id} task={task} />)
            )}
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Coming up</h3>
              <p>Scheduled reminders.</p>
            </div>
            <button type="button" className="text-link" onClick={() => navigate('reminders')}>
              All reminders
            </button>
          </header>
          <div className="panel__body">
            {upcomingReminders.length === 0 ? (
              <EmptyState
                icon={<Bell size={20} />}
                title="No reminders set"
                hint="Open any link, plan, task or note and schedule a nudge."
                action={
                  <Button size="sm" variant="subtle" onClick={() => navigate('reminders')}>
                    Set one up
                  </Button>
                }
              />
            ) : (
              <ul className="reminder-list">
                {upcomingReminders.map((reminder) => {
                  const item = state.items.find((entry) => entry.id === reminder.itemId);
                  const info = reminderInfo(reminder.remindAt);
                  return (
                    <li key={reminder.id} className="reminder-list__item">
                      <span className={`reminder-dot ${info.due ? 'is-due' : ''}`} />
                      <div className="reminder-list__main">
                        <button
                          type="button"
                          className="reminder-list__title"
                          onClick={() => {
                            if (!item) return;
                            if (item.kind === 'plan') navigate('plan', item.id);
                            else navigate(item.kind === 'link' ? 'links' : item.kind === 'task' ? 'tasks' : 'notes');
                          }}
                        >
                          {item?.title ?? reminder.text}
                        </button>
                        <span className="reminder-list__meta">{info.absolute}</span>
                      </div>
                      <span className={`reminder-when ${info.due ? 'is-due' : ''}`}>{info.label}</span>
                      <div className="reminder-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void run(api.snoozeReminder(reminder.id, 60), { success: 'Snoozed 1 hour' })}
                        >
                          1h
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void run(api.dismissReminder(reminder.id), { success: 'Reminder dismissed' })}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Recent links</h3>
              <p>The newest additions to your library.</p>
            </div>
            <button type="button" className="text-link" onClick={() => navigate('links')}>
              All links
            </button>
          </header>
          <div className="panel__body panel__body--grid">
            {recentLinks.length === 0 ? (
              <EmptyState
                icon={<Link2 size={20} />}
                title="No links yet"
                hint="Save an article, tool or page you want to come back to."
                action={
                  <Button size="sm" variant="subtle" icon={<Plus size={13} />} onClick={() => openEditor({ kind: 'link' })}>
                    Save a link
                  </Button>
                }
              />
            ) : (
              recentLinks.map((link) => <LinkCard key={link.id} link={link} compact />)
            )}
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Active plans</h3>
              <p>Step-by-step work in progress.</p>
            </div>
            <button type="button" className="text-link" onClick={() => navigate('plans')}>
              All plans
            </button>
          </header>
          <div className="panel__body panel__body--grid">
            {activePlans.length === 0 ? (
              <EmptyState
                icon={<Target size={20} />}
                title="No active plans"
                hint="Turn a goal into checklist steps you can tick off."
                action={
                  <Button size="sm" variant="subtle" icon={<Plus size={13} />} onClick={() => openEditor({ kind: 'plan' })}>
                    Start a plan
                  </Button>
                }
              />
            ) : (
              activePlans.map((plan) => <PlanCard key={plan.id} plan={plan} />)
            )}
          </div>
        </section>
      </div>

      {notes.length > 0 ? (
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Latest notes</h3>
              <p>Loose thoughts and research.</p>
            </div>
            <button type="button" className="text-link" onClick={() => navigate('notes')}>
              All notes
            </button>
          </header>
          <div className="panel__body note-strip">
            {[...notes]
              .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 3)
              .map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="note-strip__item"
                  onClick={() => openEditor({ kind: 'note', item: note })}
                >
                  <span className="note-strip__title">
                    <NotebookPen size={13} /> {note.title}
                  </span>
                  <span className="note-strip__body">{note.notes || 'Empty note'}</span>
                </button>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  onClick: () => void;
  tone?: 'warn';
}) {
  return (
    <button type="button" className={`stat ${tone === 'warn' ? 'stat--warn' : ''}`} onClick={onClick}>
      <span className="stat__icon">{icon}</span>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </button>
  );
}

function Welcome() {
  const { openEditor, api, run, pushToast } = useApp();

  return (
    <div className="welcome">
      <div className="welcome__card">
        <div className="welcome__badge">
          <Sparkles size={14} /> Your personal URL + workflow space
        </div>
        <h2>Capture a link. Plan the work. Remember the follow-up.</h2>
        <p>
          URL Flow keeps every saved address next to the notes, steps, tasks and reminders that give it
          meaning. Everything is stored on this computer — no account, no cloud.
        </p>
        <div className="welcome__actions">
          <Button variant="primary" icon={<Link2 size={15} />} onClick={() => openEditor({ kind: 'link' })}>
            Save your first link
          </Button>
          <Button variant="subtle" icon={<Target size={15} />} onClick={() => openEditor({ kind: 'plan' })}>
            Start a plan
          </Button>
          <Button variant="subtle" icon={<NotebookPen size={15} />} onClick={() => openEditor({ kind: 'note' })}>
            Write a note
          </Button>
        </div>
        <div className="welcome__tips">
          <div>
            <strong>Links</strong>
            <span>Paste a URL, fetch its title, tag it and attach it to a plan.</span>
          </div>
          <div>
            <strong>Plans &amp; steps</strong>
            <span>Turn a goal into a checklist and track progress as you tick things off.</span>
          </div>
          <div>
            <strong>Reminders</strong>
            <span>Get a Windows notification when it is time to act.</span>
          </div>
          <div>
            <strong>Matches &amp; archive</strong>
            <span>Merge duplicates in one click; archive what you no longer need.</span>
          </div>
        </div>
        <footer className="welcome__footer">
          <span>Already have a backup? Restore it from Settings.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const result = await run(api.importData());
              if (result) pushToast('Backup restored', 'success');
            }}
          >
            Import backup
          </Button>
        </footer>
      </div>
    </div>
  );
}
