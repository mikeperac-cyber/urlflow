import { describe, expect, it } from 'vitest';
import { normalizeState, updateItem } from '../../shared/core';
import {
  instantiateTemplate,
  normalizePlanTemplates,
  templateFromPlan,
  upsertPlanTemplate,
} from '../../shared/templates';
import {
  PLAN_COLORS,
  emptyState,
  type LinkItem,
  type PlanItem,
  type PlanTemplate,
  type TaskItem,
} from '../../shared/types';

export function plan(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'p1',
    kind: 'plan',
    title: 'Plan',
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    summary: '',
    status: 'active',
    targetDate: null,
    steps: [],
    color: PLAN_COLORS[0],
    pinned: false,
    scratchpad: '',
    ...overrides,
  };
}

export function link(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: 'l1',
    kind: 'link',
    title: 'Link',
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.com',
    favorite: false,
    readingState: 'unread',
    lastOpenedAt: null,
    snapshotAt: null,
    ...overrides,
  };
}

export function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    kind: 'task',
    title: 'Task',
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    done: false,
    dueAt: null,
    priority: 'normal',
    completedAt: null,
    ...overrides,
  };
}

export function template(overrides: Partial<PlanTemplate> = {}): PlanTemplate {
  return {
    id: 't1',
    name: 'Launch',
    summary: '',
    color: PLAN_COLORS[0],
    steps: [],
    tasks: [],
    linkIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const legacyPlan = {
  id: 'p1',
  kind: 'plan',
  title: 'Plan',
  notes: '',
  tags: [],
  planId: null,
  archivedAt: null,
  reviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  summary: '',
  status: 'active',
  targetDate: null,
  steps: [],
  color: PLAN_COLORS[0],
};

describe('plan execution fields', () => {
  it('defaultsPinnedAndScratchpadOnLegacyPlans', () => {
    const state = normalizeState({
      version: 2,
      items: [legacyPlan],
      reminders: [],
      ignoredMatches: [],
    });
    expect(state.items[0]).toMatchObject({ pinned: false, scratchpad: '' });
    expect(state.planTemplates).toEqual([]);
  });

  it('clampsScratchpadAndKeepsPinnedThroughUpdates', () => {
    const state = normalizeState({
      version: 2,
      items: [{ ...legacyPlan, pinned: true, scratchpad: 'x'.repeat(30_000) }],
      reminders: [],
      ignoredMatches: [],
    });
    const stored = state.items[0];
    expect(stored.kind === 'plan' && stored.scratchpad).toHaveLength(20_000);
    expect(stored.kind === 'plan' && stored.pinned).toBe(true);

    const pinned = updateItem(state, 'p1', { pinned: false });
    expect(pinned.items[0]).toMatchObject({ pinned: false });

    const scratchpad = updateItem(state, 'p1', { scratchpad: 'y'.repeat(21_000) });
    expect(scratchpad.items[0].kind === 'plan' && scratchpad.items[0].scratchpad).toHaveLength(20_000);
  });
});

describe('plan templates', () => {
  it('usesDayOffsetsBeforeTheTargetDate', () => {
    const saved = templateFromPlan(
      plan({
        targetDate: '2026-12-10T12:00:00.000Z',
        steps: [{ id: 's1', text: 'A', done: false, dueAt: '2026-12-01T12:00:00.000Z' }],
      }),
      [],
      [],
      new Date('2026-11-15T00:00:00.000Z'),
    );
    expect(saved.steps[0].dayOffset).toBe(9);
  });

  it('fallsBackToStepIndexWithoutATargetDate', () => {
    const saved = templateFromPlan(
      plan({
        targetDate: null,
        steps: [
          { id: 's1', text: 'A', done: false },
          { id: 's2', text: 'B', done: false },
        ],
      }),
      [],
      [],
    );
    expect(saved.steps.map((step) => step.dayOffset)).toEqual([0, 1]);
  });

  it('instantiatesDueDatesFromTheChosenEndDate', () => {
    const saved = template({
      steps: [{ text: 'Prep', notes: '', dayOffset: 2 }],
      tasks: [{ title: 'Ship', notes: '', priority: 'normal', dayOffset: 0 }],
      linkIds: ['l1'],
    });
    const state = { ...emptyState(), items: [link({ id: 'l1' })] };
    const result = instantiateTemplate(
      saved,
      { title: 'Fresh', startDate: '2026-11-15', endDate: '2026-11-20' },
      state,
    );
    const createdPlan = result.state.items.find((item) => item.id === result.planId);
    expect(createdPlan?.kind === 'plan' && createdPlan.steps[0].dueAt)
      .toBe(new Date('2026-11-18T09:00:00').toISOString());
    expect(result.state.items.find((item) => item.id === 'l1')).toMatchObject({ planId: result.planId });
  });

  it('keepsOrderedStepsAndTasksWithValidDatesWithoutATargetDate', () => {
    const saved = templateFromPlan(
      plan({
        targetDate: null,
        steps: [
          { id: 's1', text: 'First', done: false },
          { id: 's2', text: 'Second', done: false },
        ],
      }),
      [],
      [task({ id: 'k1', planId: 'p1', title: 'Follow up' })],
    );
    expect(saved.steps.map((step) => step.dayOffset)).toEqual([0, 1]);
    expect(saved.tasks[0].dayOffset).toBe(0);

    const result = instantiateTemplate(
      saved,
      { title: 'From plan', startDate: '2026-11-15', endDate: '2026-11-20' },
      emptyState(),
    );
    const createdPlan = result.state.items.find((item) => item.id === result.planId);
    expect(createdPlan?.kind === 'plan' && createdPlan.steps.map((step) => step.text)).toEqual(['First', 'Second']);
    const createdSteps = createdPlan?.kind === 'plan' ? createdPlan.steps : [];
    for (const step of createdSteps) expect(Number.isNaN(new Date(step.dueAt!).getTime())).toBe(false);
    const createdTask = result.state.items.find((item) => item.kind === 'task' && item.planId === result.planId);
    expect(createdTask && Number.isNaN(new Date(createdTask.dueAt!).getTime())).toBe(false);
  });

  it('rejectsAnEndDateBeforeTheStartDate', () => {
    expect(() =>
      instantiateTemplate(
        template(),
        { title: 'X', startDate: '2026-11-20', endDate: '2026-11-15' },
        emptyState(),
      ),
    ).toThrow('The end date must be on or after the start date.');
  });

  it('rejectsMissingTitleOrDates', () => {
    for (const options of [
      { title: '  ', startDate: '2026-11-15', endDate: '2026-11-16' },
      { title: 'X', startDate: '15/11/2026', endDate: '2026-11-16' },
      { title: 'X', startDate: '2026-11-15', endDate: '' },
    ]) {
      expect(() => instantiateTemplate(template(), options, emptyState()))
        .toThrow('Choose a title, a start date and an end date.');
    }
  });

  it('skipsLinksThatNoLongerExistOrWereArchived', () => {
    const result = instantiateTemplate(
      template({ linkIds: ['gone', 'l1', 'l2'] }),
      { title: 'X', startDate: '2026-11-15', endDate: '2026-11-16' },
      {
        ...emptyState(),
        items: [
          link({ id: 'l1' }),
          link({ id: 'l2', archivedAt: '2026-01-02T00:00:00.000Z' }),
        ],
      },
    );
    const links = result.state.items.filter((item) => item.kind === 'link');
    expect(links.map((item) => item.id)).toEqual(['l1', 'l2']);
    expect(links[0]).toMatchObject({ planId: result.planId });
    expect(links[1]).toMatchObject({ planId: null });
  });

  it('replacesATemplateWithTheSameNameCaseInsensitively', () => {
    const saved = upsertPlanTemplate(
      { ...emptyState(), planTemplates: [template({ id: 'old', name: 'Launch' })] },
      template({ id: 'new', name: 'launch' }),
    );
    expect(saved.planTemplates).toHaveLength(1);
    expect(saved.planTemplates[0].id).toBe('new');
  });

  it('normalizesTemplatesAndDropsMalformedEntries', () => {
    const valid = template({
      steps: [{ text: 'A', notes: '', dayOffset: -4 }],
      tasks: [{ title: 'T', notes: '', priority: 'high', dayOffset: 2 }],
      linkIds: ['l1', 'bad id', 'l1'],
    });
    const normalized = normalizePlanTemplates([
      valid,
      { id: 'bad id', name: 'Broken' },
      template({ id: 't1', name: 'Duplicate id' }),
      { id: 't2', name: '   ' },
      null,
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({ id: 't1', linkIds: ['l1'] });
    expect(normalized[0].steps[0].dayOffset).toBe(0);
    expect(normalized[0].tasks[0]).toMatchObject({ priority: 'high', dayOffset: 2 });
    expect(normalizePlanTemplates('nope')).toEqual([]);
  });
});
