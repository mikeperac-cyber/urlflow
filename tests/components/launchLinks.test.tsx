import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkItem, PlanItem } from '../../shared/types';
import { PLAN_COLORS } from '../../shared/types';
import { PlanDetail } from '../../src/views/PlanDetail';

vi.mock('../../src/components/items', () => ({
  LinkCard: () => null,
  NoteCard: () => null,
  TaskRow: () => null,
}));

const plan: PlanItem = {
  id: 'p1',
  kind: 'plan',
  title: 'Launch',
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
};

function link(index: number): LinkItem {
  return {
    id: `l${index}`,
    kind: 'link',
    title: `Link ${index}`,
    notes: '',
    tags: [],
    planId: 'p1',
    archivedAt: null,
    reviewedAt: null,
    createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: `https://example.com/${index}`,
    favorite: false,
    readingState: 'unread',
    lastOpenedAt: null,
    snapshotAt: null,
  };
}

const boundary = vi.hoisted(() => ({
  launchPlanLinks: vi.fn(),
  run: vi.fn(),
}));
vi.mock('../../src/app-context', () => ({
  useApp: () => ({
    view: { name: 'plan', id: 'p1' },
    plans: [plan],
    links: Array.from({ length: 9 }, (_, index) => link(index)),
    tasks: [],
    notes: [],
    navigate: vi.fn(),
    openEditor: vi.fn(),
    openReminder: vi.fn(),
    api: { launchPlanLinks: boundary.launchPlanLinks, update: vi.fn(), savePlanTemplate: vi.fn() },
    run: boundary.run,
    remindersById: new Map(),
    archiveItem: vi.fn(),
  }),
}));

beforeEach(() => {
  boundary.launchPlanLinks.mockReset().mockResolvedValue({});
  boundary.run.mockReset().mockImplementation(async (promise: Promise<unknown>) => promise);
});
afterEach(cleanup);

describe('launch all plan links', () => {
  it('confirmsBeforeOpeningMoreThanEightLinks', async () => {
    render(<PlanDetail />);
    fireEvent.click(screen.getByRole('button', { name: /Launch all links/ }));

    expect(boundary.launchPlanLinks).not.toHaveBeenCalled();
    expect(screen.getByText(/9 links/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(boundary.launchPlanLinks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Launch all links/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    });
    expect(boundary.launchPlanLinks).toHaveBeenCalledTimes(1);
    expect(boundary.launchPlanLinks).toHaveBeenCalledWith('p1');
  });
});
