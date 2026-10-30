import { useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  CalendarClock,
  Check,
  Link2,
  ListPlus,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import { planProgress } from '../../shared/core';
import type { Step } from '../../shared/types';
import { useApp } from '../app-context';
import { LinkCard, NoteCard, TaskRow } from '../components/items';
import { Button, EmptyState, IconButton, Progress, TagPill } from '../components/ui';
import { formatDate, fromInputValue, reminderInfo, toInputValue } from '../lib/dates';

export function PlanDetail() {
  const {
    view,
    plans,
    links,
    tasks,
    notes,
    navigate,
    openEditor,
    openReminder,
    api,
    run,
    remindersById,
    archiveItem,
  } = useApp();
  const plan = plans.find((entry) => entry.id === view.id);
  const [stepText, setStepText] = useState('');
  const [taskText, setTaskText] = useState('');
  const [editingStep, setEditingStep] = useState<{
    id: string;
    text: string;
    dueAt: string;
    notes: string;
  } | null>(null);

  if (!plan) {
    return (
      <EmptyState
        icon={<Target size={22} />}
        title="This plan is no longer available"
        hint="It may have been archived or merged into another plan."
        action={
          <Button variant="subtle" icon={<ArrowLeft size={14} />} onClick={() => navigate('plans')}>
            Back to plans
          </Button>
        }
      />
    );
  }

  const progress = planProgress(plan);
  const planTasks = tasks
    .filter((task) => task.planId === plan.id)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const planLinks = links
    .filter((link) => link.planId === plan.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const planNotes = notes
    .filter((note) => note.planId === plan.id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const reminder = remindersById.get(plan.id);

  async function addStep() {
    const text = stepText.trim();
    if (!text || !plan) return;
    const saved = await run(
      api.update(plan.id, {
        steps: [...plan.steps, { id: crypto.randomUUID(), text, done: false }],
      }),
    );
    if (saved) setStepText('');
  }

  async function removeStep(stepId: string) {
    if (!plan) return;
    await run(api.update(plan.id, { steps: plan.steps.filter((step) => step.id !== stepId) }));
  }

  function editStep(step: Step) {
    setEditingStep({
      id: step.id,
      text: step.text,
      dueAt: toInputValue(step.dueAt),
      notes: step.notes ?? '',
    });
  }

  async function saveStep() {
    if (!plan || !editingStep) return;
    const text = editingStep.text.trim();
    if (!text) return;
    const saved = await run(
      api.update(plan.id, {
        steps: plan.steps.map((step) =>
          step.id === editingStep.id
            ? {
                ...step,
                text,
                dueAt: fromInputValue(editingStep.dueAt),
                notes: editingStep.notes,
              }
            : step,
        ),
      }),
      { success: 'Step updated' },
    );
    if (saved) setEditingStep(null);
  }

  async function moveStep(stepId: string, direction: -1 | 1) {
    if (!plan) return;
    const index = plan.steps.findIndex((step) => step.id === stepId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= plan.steps.length) return;
    const steps = [...plan.steps];
    const [moved] = steps.splice(index, 1);
    steps.splice(target, 0, moved);
    await run(api.update(plan.id, { steps }));
  }

  async function stepToTask(step: Step) {
    if (!plan) return;
    await run(
      api.create({
        kind: 'task',
        title: step.text,
        notes: step.notes ?? '',
        dueAt: step.dueAt ?? null,
        planId: plan.id,
      }),
      { success: 'Task created from step' },
    );
  }

  async function addTask() {
    const text = taskText.trim();
    if (!text || !plan) return;
    const saved = await run(api.create({ kind: 'task', title: text, planId: plan.id }), {
      success: 'Task added to plan',
    });
    if (saved) setTaskText('');
  }

  return (
    <div className="stack detail">
      <button type="button" className="back-link" onClick={() => navigate('plans')}>
        <ArrowLeft size={14} /> All plans
      </button>

      <section className="plan-hero" style={{ ['--plan-color' as string]: plan.color }}>
        <div className="plan-hero__main">
          <div className="plan-hero__top">
            <span className="plan-hero__dot" />
            <span className={`status status--${plan.status}`}>{plan.status}</span>
            {plan.targetDate ? (
              <span className="plan-hero__date">
                <CalendarClock size={13} /> Target {formatDate(plan.targetDate)}
              </span>
            ) : null}
            {plan.tags.map((tag) => (
              <TagPill key={tag}>#{tag}</TagPill>
            ))}
          </div>
          <h2>{plan.title}</h2>
          {plan.summary ? <p className="plan-hero__summary">{plan.summary}</p> : null}
          <div className="plan-hero__progress">
            <Progress percent={progress.percent} color={plan.color} height={8} />
            <span>
              {progress.done} of {progress.total} steps complete · {progress.percent}%
            </span>
          </div>
        </div>
        <div className="plan-hero__actions">
          <Button variant="primary" icon={<Pencil size={14} />} onClick={() => openEditor({ kind: 'plan', item: plan })}>
            Edit plan
          </Button>
          <Button variant="subtle" icon={<Bell size={14} />} onClick={() => openReminder(plan)}>
            {reminder ? 'Change reminder' : 'Remind me'}
          </Button>
          <IconButton
            label="Archive plan"
            onClick={() => {
              void archiveItem(plan.id, 'Plan archived').then((result) => {
                if (result) navigate('plans');
              });
            }}
          >
            <Archive size={15} />
          </IconButton>
        </div>
      </section>

      <div className="detail-grid">
        <div className="stack">
          <section className="panel">
            <header className="panel__head">
              <div>
                <h3>Actionable steps</h3>
                <p>Small, concrete moves that move the plan forward.</p>
              </div>
              <span className="panel__count">
                {progress.done}/{progress.total}
              </span>
            </header>
            <div className="panel__body">
              {plan.steps.length === 0 ? (
                <p className="muted">No steps yet. Add the first action below.</p>
              ) : (
                <ul className="steps">
                  {plan.steps.map((step, index) => (
                    <li
                      key={step.id}
                      className={`step ${step.done ? 'is-done' : ''} ${
                        editingStep?.id === step.id ? 'is-editing' : ''
                      }`}
                    >
                      <div className="step__row">
                        <button
                          type="button"
                          className="step__check"
                          aria-label={step.done ? 'Reopen step' : 'Complete step'}
                          onClick={() => void run(api.toggleStep(plan.id, step.id))}
                        >
                          {step.done ? <Check size={12} /> : <span>{index + 1}</span>}
                        </button>
                        <button type="button" className="step__text" onClick={() => editStep(step)}>
                          {step.text}
                        </button>
                        <span className="step__meta">
                          {step.dueAt ? (
                            <span className="step-chip">
                              <CalendarClock size={11} /> {formatDate(step.dueAt)}
                            </span>
                          ) : null}
                          {step.notes?.trim() ? <span className="step-chip">notes</span> : null}
                        </span>
                        <div className="step__actions">
                          <IconButton
                            label="Move step up"
                            disabled={index === 0}
                            onClick={() => void moveStep(step.id, -1)}
                          >
                            <ArrowUp size={13} />
                          </IconButton>
                          <IconButton
                            label="Move step down"
                            disabled={index === plan.steps.length - 1}
                            onClick={() => void moveStep(step.id, 1)}
                          >
                            <ArrowDown size={13} />
                          </IconButton>
                          <IconButton label="Make a task from this step" onClick={() => void stepToTask(step)}>
                            <ListPlus size={13} />
                          </IconButton>
                          <IconButton label="Edit step" onClick={() => editStep(step)}>
                            <Pencil size={13} />
                          </IconButton>
                          <IconButton label="Delete step" onClick={() => void removeStep(step.id)}>
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      </div>

                      {editingStep?.id === step.id ? (
                        <div className="step-edit">
                          <input
                            className="input"
                            value={editingStep.text}
                            onChange={(event) =>
                              setEditingStep((current) =>
                                current ? { ...current, text: event.target.value } : current,
                              )
                            }
                            placeholder="What needs to happen?"
                            autoFocus
                          />
                          <div className="step-edit__row">
                            <label className="step-edit__field">
                              <span>Due</span>
                              <input
                                className="input"
                                type="datetime-local"
                                value={editingStep.dueAt}
                                onChange={(event) =>
                                  setEditingStep((current) =>
                                    current ? { ...current, dueAt: event.target.value } : current,
                                  )
                                }
                              />
                            </label>
                            <label className="step-edit__field step-edit__field--grow">
                              <span>Notes</span>
                              <input
                                className="input"
                                value={editingStep.notes}
                                onChange={(event) =>
                                  setEditingStep((current) =>
                                    current ? { ...current, notes: event.target.value } : current,
                                  )
                                }
                                placeholder="Detail, link or decision"
                              />
                            </label>
                          </div>
                          <div className="step-edit__actions">
                            <Button size="sm" variant="ghost" onClick={() => setEditingStep(null)}>
                              Cancel
                            </Button>
                            <Button size="sm" variant="primary" onClick={() => void saveStep()}>
                              Save step
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="inline-add">
                <input
                  className="input"
                  value={stepText}
                  onChange={(event) => setStepText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void addStep();
                    }
                  }}
                  placeholder="Add a step and press Enter"
                />
                <Button variant="subtle" icon={<Plus size={14} />} onClick={() => void addStep()}>
                  Add step
                </Button>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h3>Notes</h3>
                <p>Context, decisions and reference for this plan.</p>
              </div>
              <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openEditor({ kind: 'plan', item: plan })}>
                Edit
              </Button>
            </header>
            <div className="panel__body">
              {plan.notes.trim() ? (
                <div className="prose">{plan.notes}</div>
              ) : (
                <p className="muted">No notes on this plan yet. Use Edit to add background, links or decisions.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h3>Attached notes</h3>
                <p>Longer thoughts filed under this plan.</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={13} />}
                onClick={() => openEditor({ kind: 'note', preset: { planId: plan.id } })}
              >
                New note
              </Button>
            </header>
            <div className="panel__body panel__body--grid">
              {planNotes.length === 0 ? (
                <p className="muted">No notes attached yet.</p>
              ) : (
                planNotes.map((note) => <NoteCard key={note.id} note={note} compact />)
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <header className="panel__head">
              <div>
                <h3>Tasks</h3>
                <p>{planTasks.filter((task) => !task.done).length} open</p>
              </div>
            </header>
            <div className="panel__body panel__body--flush">
              {planTasks.length === 0 ? (
                <p className="muted muted--padded">No tasks in this plan yet.</p>
              ) : (
                planTasks.map((task) => <TaskRow key={task.id} task={task} showPlan={false} />)
              )}
              <div className="inline-add inline-add--padded">
                <input
                  className="input"
                  value={taskText}
                  onChange={(event) => setTaskText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void addTask();
                    }
                  }}
                  placeholder="Add a task, press Enter"
                />
                <IconButton label="Add task" onClick={() => void addTask()}>
                  <Plus size={15} />
                </IconButton>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h3>Reminder</h3>
                <p>Nudged on this computer.</p>
              </div>
            </header>
            <div className="panel__body">
              {reminder ? (
                <div className="reminder-chip">
                  <Bell size={14} />
                  <div>
                    <strong>{reminderInfo(reminder.remindAt).absolute}</strong>
                    <span>{reminderInfo(reminder.remindAt).label}</span>
                  </div>
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
              ) : (
                <Button variant="subtle" icon={<Bell size={14} />} onClick={() => openReminder(plan)}>
                  Set a reminder
                </Button>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="panel__head">
              <div>
                <h3>Links</h3>
                <p>Sources and references.</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Link2 size={13} />}
                onClick={() => openEditor({ kind: 'link', preset: { planId: plan.id } })}
              >
                Add
              </Button>
            </header>
            <div className="panel__body panel__body--grid">
              {planLinks.length === 0 ? (
                <p className="muted">
                  <Link2 size={13} /> No links attached yet.
                </p>
              ) : (
                planLinks.map((link) => <LinkCard key={link.id} link={link} compact />)
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
