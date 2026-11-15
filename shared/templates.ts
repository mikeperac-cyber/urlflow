import { newId, nowIso } from './ids';
import {
  PLAN_COLORS,
  type AppState,
  type LinkItem,
  type PlanItem,
  type PlanTemplate,
  type PlanTemplateOptions,
  type Priority,
  type Step,
  type TaskItem,
} from './types';

const MAX_STEPS = 200;
const MAX_TASKS = 200;
const MAX_LINKS = 200;
const MAX_OFFSET = 3650;
const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function startOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function offsetFor(dueAt: string | null | undefined, targetStart: number | null, index: number): number {
  if (targetStart === null) return Math.min(index, MAX_OFFSET);
  const day = startOfDay(dueAt);
  if (day === null) return Math.min(index, MAX_OFFSET);
  return Math.max(0, Math.min(MAX_OFFSET, Math.round((targetStart - day) / DAY_MS)));
}

function pushPriority(value: unknown): Priority {
  return value === 'low' || value === 'high' ? value : 'normal';
}

/** Builds a reusable template; offsets count days before the plan's target date. */
export function templateFromPlan(
  plan: PlanItem,
  links: LinkItem[],
  tasks: TaskItem[],
  now: Date = new Date(),
): PlanTemplate {
  const targetStart = startOfDay(plan.targetDate);
  const timestamp = now.toISOString();
  const steps = plan.steps.slice(0, MAX_STEPS).map((step: Step, index) => ({
    text: String(step.text ?? '').slice(0, 300),
    notes: String(step.notes ?? '').slice(0, 2_000),
    dayOffset: offsetFor(step.dueAt, targetStart, index),
  }));
  const templateTasks = tasks
    .filter((task) => task.planId === plan.id && !task.archivedAt)
    .slice(0, MAX_TASKS)
    .map((task, index) => ({
      title: String(task.title ?? '').slice(0, 300),
      notes: String(task.notes ?? '').slice(0, 2_000),
      priority: pushPriority(task.priority),
      dayOffset: offsetFor(task.dueAt, targetStart, index),
    }));
  const linkIds = links
    .filter((link) => link.planId === plan.id && !link.archivedAt)
    .slice(0, MAX_LINKS)
    .map((link) => link.id);

  return {
    id: newId(),
    name: String(plan.title ?? '').trim().slice(0, 300) || 'Untitled template',
    summary: String(plan.summary ?? '').slice(0, 600),
    color: PLAN_COLORS.includes(plan.color) ? plan.color : PLAN_COLORS[0],
    steps,
    tasks: templateTasks,
    linkIds,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertPlanTemplate(state: AppState, template: PlanTemplate): AppState {
  const name = template.name.trim().toLowerCase();
  const existing = state.planTemplates.findIndex((entry) => entry.name.trim().toLowerCase() === name);
  const planTemplates = [...state.planTemplates];
  if (existing >= 0) planTemplates[existing] = template;
  else planTemplates.unshift(template);
  return { ...state, planTemplates };
}

/** Creates a plan, its tasks and re-pointed links in one new state object. */
export function instantiateTemplate(
  template: PlanTemplate,
  options: PlanTemplateOptions,
  state: AppState,
  now: Date = new Date(),
): { state: AppState; planId: string } {
  const title = String(options.title ?? '').trim().slice(0, 300);
  if (!title || !DATE_ONLY.test(options.startDate) || !DATE_ONLY.test(options.endDate)) {
    throw new Error('Choose a title, a start date and an end date.');
  }
  if (options.endDate < options.startDate) {
    throw new Error('The end date must be on or after the start date.');
  }

  const anchor = new Date(`${options.endDate}T09:00:00`);
  if (Number.isNaN(anchor.getTime())) throw new Error('Choose a title, a start date and an end date.');
  const timestamp = now.toISOString();
  const planId = newId();

  const steps: Step[] = template.steps.slice(0, MAX_STEPS).map((step) => {
    const offset = Math.max(0, Math.min(MAX_OFFSET, Math.round(step.dayOffset)));
    return {
      id: newId(),
      text: String(step.text ?? '').slice(0, 300),
      notes: String(step.notes ?? '').slice(0, 2_000),
      done: false,
      dueAt: new Date(anchor.getTime() - offset * DAY_MS).toISOString(),
    };
  });

  const instantiatedTasks: TaskItem[] = template.tasks.slice(0, MAX_TASKS).map((task) => {
    const offset = Math.max(0, Math.min(MAX_OFFSET, Math.round(task.dayOffset)));
    return {
      id: newId(),
      kind: 'task',
      title: String(task.title ?? '').slice(0, 300) || 'Untitled task',
      notes: String(task.notes ?? '').slice(0, 2_000),
      tags: [],
      planId,
      archivedAt: null,
      reviewedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      done: false,
      dueAt: new Date(anchor.getTime() - offset * DAY_MS).toISOString(),
      priority: pushPriority(task.priority),
      completedAt: null,
    };
  });

  const plan: PlanItem = {
    id: planId,
    kind: 'plan',
    title,
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    summary: String(template.summary ?? '').slice(0, 600),
    status: 'active',
    targetDate: new Date(`${options.endDate}T12:00:00`).toISOString(),
    steps,
    color: PLAN_COLORS.includes(template.color) ? template.color : PLAN_COLORS[0],
    pinned: false,
    scratchpad: '',
  };

  const templateLinkIds = new Set(template.linkIds.slice(0, MAX_LINKS));
  const items = state.items.map((item) => {
    if (item.kind !== 'link' || item.archivedAt || !templateLinkIds.has(item.id)) return item;
    return { ...item, planId, updatedAt: timestamp };
  });

  return { state: { ...state, items: [plan, ...instantiatedTasks, ...items] }, planId };
}

function normalizeOffset(value: unknown): number | null {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(MAX_OFFSET, number));
}

/** Defensive reader for stored templates; malformed entries are dropped, not repaired blindly. */
export function normalizePlanTemplates(raw: unknown): PlanTemplate[] {
  if (!Array.isArray(raw)) return [];
  const templates: PlanTemplate[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<PlanTemplate>;
    if (typeof candidate.id !== 'string' || !ID.test(candidate.id) || ids.has(candidate.id)) continue;
    const name = String(candidate.name ?? '').trim().slice(0, 300);
    if (!name) continue;

    const steps: PlanTemplate['steps'] = [];
    if (Array.isArray(candidate.steps)) {
      for (const step of candidate.steps.slice(0, MAX_STEPS)) {
        if (!step || typeof step !== 'object') continue;
        const text = String((step as { text?: unknown }).text ?? '').slice(0, 300);
        const dayOffset = normalizeOffset((step as { dayOffset?: unknown }).dayOffset);
        if (!text.trim() || dayOffset === null) continue;
        steps.push({
          text,
          notes: String((step as { notes?: unknown }).notes ?? '').slice(0, 2_000),
          dayOffset,
        });
      }
    }

    const tasks: PlanTemplate['tasks'] = [];
    if (Array.isArray(candidate.tasks)) {
      for (const task of candidate.tasks.slice(0, MAX_TASKS)) {
        if (!task || typeof task !== 'object') continue;
        const title = String((task as { title?: unknown }).title ?? '').slice(0, 300);
        const dayOffset = normalizeOffset((task as { dayOffset?: unknown }).dayOffset);
        if (!title.trim() || dayOffset === null) continue;
        tasks.push({
          title,
          notes: String((task as { notes?: unknown }).notes ?? '').slice(0, 2_000),
          priority: pushPriority((task as { priority?: unknown }).priority),
          dayOffset,
        });
      }
    }

    const linkIds: string[] = [];
    if (Array.isArray(candidate.linkIds)) {
      for (const id of candidate.linkIds.slice(0, MAX_LINKS)) {
        if (typeof id !== 'string' || !ID.test(id) || linkIds.includes(id)) continue;
        linkIds.push(id);
      }
    }

    ids.add(candidate.id);
    templates.push({
      id: candidate.id,
      name,
      summary: String(candidate.summary ?? '').slice(0, 600),
      color: PLAN_COLORS.includes(String(candidate.color)) ? String(candidate.color) : PLAN_COLORS[0],
      steps,
      tasks,
      linkIds,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : nowIso(),
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : nowIso(),
    });
  }
  return templates;
}
