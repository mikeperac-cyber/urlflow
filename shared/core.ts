import {
  PLAN_COLORS,
  emptyState,
  type AnyItem,
  type AppState,
  type BookmarkEntry,
  type BookmarkImportResult,
  type ItemDraft,
  type ItemPatch,
  type LinkItem,
  type MergeFieldChoices,
  type NoteItem,
  type PlanItem,
  type Priority,
  type Reminder,
  type RepeatRule,
  type Step,
  type TaskItem,
} from './types';
import { displayUrl, isSafeExternalUrl, normalizeUrl } from './url';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = String(raw ?? '').trim().replace(/^#+/, '');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag.slice(0, 32));
  }
  return out.slice(0, 20);
}

function cleanSteps(steps: unknown): Step[] {
  if (!Array.isArray(steps)) return [];
  const out: Step[] = [];
  for (const raw of steps) {
    if (!raw) continue;
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) out.push({ id: newId(), text: text.slice(0, 300), done: false });
      continue;
    }
    const step = raw as Partial<Step>;
    const text = String(step.text ?? '').trim();
    if (!text) continue;
    out.push({
      id: typeof step.id === 'string' && step.id ? step.id : newId(),
      text: text.slice(0, 300),
      done: Boolean(step.done),
      dueAt: typeof step.dueAt === 'string' && step.dueAt ? step.dueAt : null,
      notes: String(step.notes ?? '').slice(0, 2000),
    });
  }
  return out.slice(0, 200);
}

function resolvePlanId(state: AppState, planId: unknown): string | null {
  if (typeof planId !== 'string' || !planId) return null;
  const plan = state.items.find((item) => item.id === planId && item.kind === 'plan');
  return plan ? plan.id : null;
}

function baseFromDraft(state: AppState, draft: ItemDraft) {
  const timestamp = nowIso();
  return {
    id: newId(),
    title: String(draft.title ?? '').trim().slice(0, 300),
    notes: String(draft.notes ?? ''),
    tags: cleanTags(draft.tags),
    planId: resolvePlanId(state, draft.planId),
    archivedAt: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createItem(state: AppState, draft: ItemDraft): { state: AppState; id: string } {
  const base = baseFromDraft(state, draft);
  let item: AnyItem;

  switch (draft.kind) {
    case 'link': {
      const normalized = normalizeUrl(draft.url ?? '');
      const url = normalized.url;
      if (!url || !isSafeExternalUrl(url)) {
        throw new Error('Enter a valid web address (http or https).');
      }
      const link: LinkItem = {
        ...base,
        kind: 'link',
        title: base.title || normalized.key.replace(/^https?:\/\//, ''),
        url,
        favorite: Boolean(draft.favorite),
        lastOpenedAt: null,
      };
      item = link;
      break;
    }
    case 'plan': {
      const plan: PlanItem = {
        ...base,
        kind: 'plan',
        title: base.title || 'Untitled plan',
        summary: String(draft.summary ?? '').slice(0, 600),
        status: draft.status === 'paused' || draft.status === 'done' ? draft.status : 'active',
        targetDate: draft.targetDate ? String(draft.targetDate) : null,
        steps: cleanSteps(draft.steps),
        color: PLAN_COLORS.includes(String(draft.color)) ? String(draft.color) : PLAN_COLORS[0],
        planId: null,
      };
      item = plan;
      break;
    }
    case 'task': {
      const task: TaskItem = {
        ...base,
        kind: 'task',
        title: base.title || 'Untitled task',
        done: Boolean(draft.done),
        dueAt: draft.dueAt ? String(draft.dueAt) : null,
        priority: (['low', 'normal', 'high'] as Priority[]).includes(draft.priority as Priority)
          ? (draft.priority as Priority)
          : 'normal',
        completedAt: draft.done ? nowIso() : null,
      };
      item = task;
      break;
    }
    case 'note':
    default: {
      const note: NoteItem = {
        ...base,
        kind: 'note',
        title: base.title || 'Untitled note',
        pinned: Boolean(draft.pinned),
      };
      item = note;
      break;
    }
  }

  let next: AppState = { ...state, items: [item, ...state.items] };
  if (draft.reminderAt) {
    next = setReminder(next, item.id, draft.reminderAt, draft.reminderText, draft.reminderRepeat);
  }
  return { state: next, id: item.id };
}

export function updateItem(state: AppState, id: string, patch: ItemPatch): AppState {
  const existing = state.items.find((item) => item.id === id);
  if (!existing) return state;

  const updated = { ...existing, updatedAt: nowIso() } as AnyItem;
  if (patch.title !== undefined) updated.title = String(patch.title).trim().slice(0, 300) || existing.title;
  if (patch.notes !== undefined) updated.notes = String(patch.notes);
  if (patch.tags !== undefined) updated.tags = cleanTags(patch.tags);
  if (patch.planId !== undefined) updated.planId = resolvePlanId(state, patch.planId);

  if (updated.kind === 'link' && existing.kind === 'link') {
    if (patch.url !== undefined) {
      const normalized = normalizeUrl(patch.url);
      if (!normalized.url || !isSafeExternalUrl(normalized.url)) {
        throw new Error('Enter a valid web address (http or https).');
      }
      updated.url = normalized.url;
    }
    if (patch.favorite !== undefined) updated.favorite = Boolean(patch.favorite);
    if (patch.lastOpenedAt !== undefined) updated.lastOpenedAt = patch.lastOpenedAt;
  }

  if (updated.kind === 'plan' && existing.kind === 'plan') {
    if (patch.summary !== undefined) updated.summary = String(patch.summary).slice(0, 600);
    if (patch.status !== undefined) updated.status = patch.status;
    if (patch.targetDate !== undefined) updated.targetDate = patch.targetDate;
    if (patch.steps !== undefined) updated.steps = cleanSteps(patch.steps);
    if (patch.color !== undefined && PLAN_COLORS.includes(patch.color)) updated.color = patch.color;
  }

  if (updated.kind === 'task' && existing.kind === 'task') {
    if (patch.done !== undefined) {
      updated.done = Boolean(patch.done);
      updated.completedAt = patch.done ? nowIso() : null;
    }
    if (patch.dueAt !== undefined) updated.dueAt = patch.dueAt;
    if (patch.priority !== undefined) updated.priority = patch.priority;
  }

  if (updated.kind === 'note' && existing.kind === 'note' && patch.pinned !== undefined) {
    updated.pinned = Boolean(patch.pinned);
  }

  return { ...state, items: state.items.map((item) => (item.id === id ? updated : item)) };
}

export function removeItem(state: AppState, id: string): AppState {
  return {
    ...state,
    items: state.items
      .filter((item) => item.id !== id)
      .map((item) => (item.planId === id ? { ...item, planId: null } : item)),
    reminders: state.reminders.filter((reminder) => reminder.itemId !== id),
  };
}

export function setArchived(state: AppState, id: string, archived: boolean): AppState {
  const timestamp = nowIso();
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === id ? { ...item, archivedAt: archived ? timestamp : null, updatedAt: timestamp } : item,
    ),
    reminders: archived
      ? state.reminders.filter((reminder) => reminder.itemId !== id)
      : state.reminders,
  };
}

function mergeNotes(primary: string, other: string): string {
  const a = primary.trim();
  const b = other.trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  return `${a}\n\n---\n\n${b}`;
}

function mergeSteps(primary: Step[], other: Step[]): Step[] {
  const seen = new Set(primary.map((step) => step.text.trim().toLowerCase()));
  const merged = [...primary];
  for (const step of other) {
    const key = step.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(step);
  }
  return merged;
}

export function mergeItems(
  state: AppState,
  primaryId: string,
  otherId: string,
  choices: MergeFieldChoices = {},
): AppState {
  if (primaryId === otherId) return state;
  const primary = state.items.find((item) => item.id === primaryId);
  const other = state.items.find((item) => item.id === otherId);
  if (!primary || !other) throw new Error('One of the items no longer exists.');
  if (primary.kind !== other.kind) throw new Error('Only items of the same type can be merged.');

  const merged = {
    ...primary,
    notes: mergeNotes(primary.notes, other.notes),
    tags: cleanTags([...primary.tags, ...other.tags]),
    updatedAt: nowIso(),
  } as AnyItem;

  if (merged.kind === 'plan' && primary.kind === 'plan' && other.kind === 'plan') {
    merged.steps = mergeSteps(primary.steps, other.steps);
    merged.summary = primary.summary || other.summary;
    merged.targetDate = primary.targetDate ?? other.targetDate;
    merged.status = primary.status === 'paused' && other.status === 'active' ? 'active' : primary.status;
  }

  if (merged.kind === 'link' && primary.kind === 'link' && other.kind === 'link') {
    merged.url = primary.url || other.url;
    merged.favorite = primary.favorite || other.favorite;
    merged.lastOpenedAt = primary.lastOpenedAt ?? other.lastOpenedAt;
  }

  if (merged.kind === 'task' && primary.kind === 'task' && other.kind === 'task') {
    merged.done = primary.done && other.done;
    merged.completedAt = merged.done ? primary.completedAt ?? other.completedAt : null;
    merged.dueAt = primary.dueAt ?? other.dueAt;
    merged.priority = primary.priority === 'high' || other.priority === 'high'
      ? 'high'
      : primary.priority === 'low' && other.priority === 'low'
        ? 'low'
        : 'normal';
  }

  if (merged.kind === 'note' && primary.kind === 'note' && other.kind === 'note') {
    merged.pinned = primary.pinned || other.pinned;
  }

  if (!merged.planId && other.planId) merged.planId = other.planId;

  if (choices.titleFromId === otherId) merged.title = other.title;
  else if (choices.titleFromId === primaryId) merged.title = primary.title;

  if (choices.notesMode === 'primary') merged.notes = primary.notes;
  else if (choices.notesMode === 'other') merged.notes = other.notes;

  if (choices.dateMode === 'primary') applyMergedDate(merged, primary);
  else if (choices.dateMode === 'other') applyMergedDate(merged, other);
  else if (choices.dateMode === 'none') {
    if (merged.kind === 'plan') merged.targetDate = null;
    if (merged.kind === 'task') merged.dueAt = null;
  }

  return {
    ...state,
    items: state.items
      .filter((item) => item.id !== otherId)
      .map((item) => {
        if (item.id === primaryId) return merged;
        if (item.planId === otherId) return { ...item, planId: primaryId };
        return item;
      }),
    reminders: state.reminders.map((reminder) =>
      reminder.itemId === otherId ? { ...reminder, itemId: primaryId } : reminder,
    ),
  };
}

export function mergeMany(
  state: AppState,
  primaryId: string,
  otherIds: string[],
  choices: MergeFieldChoices = {},
): AppState {
  let next = state;
  let first = true;
  for (const id of otherIds) {
    if (id === primaryId) continue;
    if (!next.items.some((item) => item.id === id)) continue;
    next = mergeItems(next, primaryId, id, first ? choices : {});
    first = false;
  }
  return next;
}

function applyMergedDate(merged: AnyItem, source: AnyItem): void {
  if (merged.kind === 'plan' && source.kind === 'plan') merged.targetDate = source.targetDate;
  if (merged.kind === 'task' && source.kind === 'task') merged.dueAt = source.dueAt;
}

/** Records that a review pass looked at an item, so it stays out of the queue for a while. */
export function markReviewed(state: AppState, id: string): AppState {
  const timestamp = nowIso();
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === id ? { ...item, reviewedAt: timestamp } : item,
    ),
  };
}

export function patchStep(
  state: AppState,
  planId: string,
  stepId: string,
  patch: Partial<Pick<Step, 'text' | 'dueAt' | 'notes'>>,
): AppState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== planId || item.kind !== 'plan') return item;
      return {
        ...item,
        updatedAt: nowIso(),
        steps: item.steps.map((step) => {
          if (step.id !== stepId) return step;
          const next = { ...step };
          if (patch.text !== undefined) next.text = String(patch.text).trim().slice(0, 300) || step.text;
          if (patch.dueAt !== undefined) next.dueAt = patch.dueAt;
          if (patch.notes !== undefined) next.notes = String(patch.notes).slice(0, 2000);
          return next;
        }),
      };
    }),
  };
}

export function moveStep(state: AppState, planId: string, stepId: string, direction: -1 | 1): AppState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== planId || item.kind !== 'plan') return item;
      const index = item.steps.findIndex((step) => step.id === stepId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= item.steps.length) return item;
      const steps = [...item.steps];
      const [moved] = steps.splice(index, 1);
      steps.splice(target, 0, moved);
      return { ...item, steps, updatedAt: nowIso() };
    }),
  };
}

export function toggleStep(state: AppState, planId: string, stepId: string): AppState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== planId || item.kind !== 'plan') return item;
      return {
        ...item,
        updatedAt: nowIso(),
        steps: item.steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step)),
      };
    }),
  };
}

export function setReminder(
  state: AppState,
  itemId: string,
  remindAt: string,
  text?: string,
  repeat?: RepeatRule,
): AppState {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('That item no longer exists.');
  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) throw new Error('Pick a valid reminder date and time.');
  const existing = state.reminders.find((entry) => entry.itemId === itemId);
  const reminder: Reminder = {
    id: newId(),
    itemId,
    text: String(text ?? item.title).slice(0, 200),
    remindAt: date.toISOString(),
    notifiedAt: null,
    createdAt: nowIso(),
    repeat: repeat ?? existing?.repeat ?? 'none',
    lastFiredAt: null,
  };
  return {
    ...state,
    reminders: [reminder, ...state.reminders.filter((entry) => entry.itemId !== itemId)],
  };
}

function nextOccurrence(from: Date, repeat: RepeatRule): Date {
  const next = new Date(from.getTime());
  switch (repeat) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekdays':
      do {
        next.setDate(next.getDate() + 1);
      } while (next.getDay() === 0 || next.getDay() === 6);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return next;
  }
  return next;
}

/** The next time a repeating reminder should fire, always in the future. */
export function nextReminderTime(from: Date, repeat: RepeatRule, now: Date = new Date()): Date {
  if (repeat === 'none' || Number.isNaN(from.getTime())) return from;
  let next = nextOccurrence(from, repeat);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 500) {
    next = nextOccurrence(next, repeat);
    guard += 1;
  }
  return next;
}

export function snoozeReminder(state: AppState, id: string, minutes: number): AppState {
  const delta = Math.max(1, Math.min(60 * 24 * 7, Math.round(minutes)));
  const remindAt = new Date(Date.now() + delta * 60_000).toISOString();
  return {
    ...state,
    reminders: state.reminders.map((reminder) =>
      reminder.id === id ? { ...reminder, remindAt, notifiedAt: null } : reminder,
    ),
  };
}

export function removeReminder(state: AppState, id: string): AppState {
  return { ...state, reminders: state.reminders.filter((reminder) => reminder.id !== id) };
}

export function ignoreMatch(state: AppState, key: string): AppState {
  if (!key || state.ignoredMatches.includes(key)) return state;
  return { ...state, ignoredMatches: [...state.ignoredMatches, key].slice(-500) };
}

export function unignoreMatch(state: AppState, key: string): AppState {
  return { ...state, ignoredMatches: state.ignoredMatches.filter((entry) => entry !== key) };
}

export function dueReminders(state: AppState, at: Date = new Date()): Reminder[] {
  const time = at.getTime();
  return state.reminders.filter((reminder) => {
    if (reminder.notifiedAt) return false;
    const due = new Date(reminder.remindAt).getTime();
    return Number.isFinite(due) && due <= time;
  });
}

export function markReminderNotified(state: AppState, id: string): AppState {
  const firedAt = nowIso();
  return {
    ...state,
    reminders: state.reminders.map((reminder) => {
      if (reminder.id !== id) return reminder;
      if (reminder.repeat === 'none') {
        return { ...reminder, notifiedAt: firedAt, lastFiredAt: firedAt };
      }
      return {
        ...reminder,
        notifiedAt: null,
        lastFiredAt: firedAt,
        remindAt: nextReminderTime(new Date(reminder.remindAt), reminder.repeat).toISOString(),
      };
    }),
  };
}

/** Repeating reminders that already passed while the app was closed. */
export function missedReminders(state: AppState, at: Date = new Date()): Reminder[] {
  const cutoff = at.getTime() - 5 * 60_000;
  return state.reminders
    .filter((reminder) => !reminder.notifiedAt)
    .filter((reminder) => new Date(reminder.remindAt).getTime() <= cutoff)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
}

/** Adds imported browser bookmarks as links, skipping URLs already saved. */
export function importBookmarks(
  state: AppState,
  entries: BookmarkEntry[],
  tagFolders = true,
): BookmarkImportResult {
  const known = new Set(
    state.items
      .filter((item): item is LinkItem => item.kind === 'link')
      .map((item) => normalizeUrl(item.url).key)
      .filter(Boolean),
  );
  const timestamp = nowIso();
  const added: LinkItem[] = [];
  let skipped = 0;

  for (const entry of entries) {
    const normalized = normalizeUrl(entry.url);
    if (!normalized.url || !isSafeExternalUrl(normalized.url) || known.has(normalized.key)) {
      skipped += 1;
      continue;
    }
    known.add(normalized.key);
    added.push({
      id: newId(),
      kind: 'link',
      title: String(entry.title ?? '').trim().slice(0, 300) || displayUrl(normalized.url),
      notes: '',
      tags: tagFolders ? cleanTags([entry.folder]) : [],
      planId: null,
      archivedAt: null,
      reviewedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      url: normalized.url,
      favorite: false,
      lastOpenedAt: null,
    });
  }

  if (added.length === 0) return { state, added: 0, skipped };
  return { state: { ...state, items: [...added, ...state.items] }, added: added.length, skipped };
}

export function planProgress(plan: PlanItem): { done: number; total: number; percent: number } {
  const total = plan.steps.length;
  const done = plan.steps.filter((step) => step.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

const KIND_ORDER: Record<string, number> = { plan: 0, link: 1, task: 2, note: 3 };

export function sortItems(items: AnyItem[]): AnyItem[] {
  return [...items].sort((a, b) => {
    const kindDelta = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
    if (kindDelta !== 0) return kindDelta;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/**
 * Defensive reader for imported backup files: fills defaults, drops malformed
 * entries and rewrites dangling relations instead of trusting the file.
 */
export function normalizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a URL Flow backup.');
  const source = raw as Partial<AppState>;
  if (!Array.isArray(source.items)) throw new Error('That file is not a URL Flow backup.');

  const items: AnyItem[] = [];
  for (const entry of source.items) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as AnyItem;
    if (!['link', 'plan', 'task', 'note'].includes(item.kind)) continue;
    if (typeof item.id !== 'string' || !item.id) continue;
    const timestamp = typeof item.createdAt === 'string' ? item.createdAt : nowIso();
    const base = {
      id: item.id,
      title: String(item.title ?? 'Untitled').slice(0, 300),
      notes: String(item.notes ?? ''),
      tags: cleanTags(item.tags),
      planId: typeof item.planId === 'string' ? item.planId : null,
      archivedAt: typeof item.archivedAt === 'string' ? item.archivedAt : null,
      reviewedAt: typeof item.reviewedAt === 'string' ? item.reviewedAt : null,
      createdAt: timestamp,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : timestamp,
    };
    if (item.kind === 'link') {
      const normalized = normalizeUrl(item.url);
      if (!normalized.url) continue;
      items.push({
        ...base,
        kind: 'link',
        url: normalized.url,
        favorite: Boolean(item.favorite),
        lastOpenedAt: typeof item.lastOpenedAt === 'string' ? item.lastOpenedAt : null,
      });
    } else if (item.kind === 'plan') {
      items.push({
        ...base,
        kind: 'plan',
        planId: null,
        summary: String(item.summary ?? '').slice(0, 600),
        status: item.status === 'paused' || item.status === 'done' ? item.status : 'active',
        targetDate: typeof item.targetDate === 'string' ? item.targetDate : null,
        steps: cleanSteps(item.steps),
        color: PLAN_COLORS.includes(String(item.color)) ? String(item.color) : PLAN_COLORS[0],
      });
    } else if (item.kind === 'task') {
      items.push({
        ...base,
        kind: 'task',
        done: Boolean(item.done),
        dueAt: typeof item.dueAt === 'string' ? item.dueAt : null,
        priority: (['low', 'normal', 'high'] as Priority[]).includes(item.priority) ? item.priority : 'normal',
        completedAt: typeof item.completedAt === 'string' ? item.completedAt : null,
      });
    } else {
      items.push({ ...base, kind: 'note', pinned: Boolean(item.pinned) });
    }
  }

  const planIds = new Set(items.filter((item) => item.kind === 'plan').map((item) => item.id));
  for (const item of items) {
    if (item.planId && !planIds.has(item.planId)) item.planId = null;
  }

  const reminders: Reminder[] = [];
  if (Array.isArray(source.reminders)) {
    for (const entry of source.reminders) {
      if (!entry || typeof entry !== 'object') continue;
      const reminder = entry as Reminder;
      if (typeof reminder.id !== 'string' || typeof reminder.itemId !== 'string') continue;
      if (!items.some((item) => item.id === reminder.itemId)) continue;
      const when = new Date(reminder.remindAt);
      if (Number.isNaN(when.getTime())) continue;
      const repeat: RepeatRule =
        reminder.repeat === 'daily' ||
        reminder.repeat === 'weekdays' ||
        reminder.repeat === 'weekly' ||
        reminder.repeat === 'monthly'
          ? reminder.repeat
          : 'none';
      reminders.push({
        id: reminder.id,
        itemId: reminder.itemId,
        text: String(reminder.text ?? ''),
        remindAt: when.toISOString(),
        notifiedAt: typeof reminder.notifiedAt === 'string' ? reminder.notifiedAt : null,
        createdAt: typeof reminder.createdAt === 'string' ? reminder.createdAt : nowIso(),
        repeat,
        lastFiredAt: typeof reminder.lastFiredAt === 'string' ? reminder.lastFiredAt : null,
      });
    }
  }

  const ignoredMatches = Array.isArray(source.ignoredMatches)
    ? source.ignoredMatches.filter((entry): entry is string => typeof entry === 'string').slice(-500)
    : [];

  return { ...emptyState(), items, reminders, ignoredMatches };
}
