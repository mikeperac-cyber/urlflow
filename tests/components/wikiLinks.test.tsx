import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteItem, PlanItem } from '../../shared/types';
import { PLAN_COLORS } from '../../shared/types';
import { WikiText } from '../../src/components/WikiText';
import { Backlinks } from '../../src/components/Backlinks';

function note(overrides: Partial<NoteItem> = {}): NoteItem {
  return {
    id: 'n2',
    kind: 'note',
    title: 'Referrer',
    notes: 'See [[p1|Launch]]',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    ...overrides,
  };
}

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

const boundary = vi.hoisted(() => ({
  notes: [] as NoteItem[],
  plans: [] as PlanItem[],
  tasks: [] as never[],
  links: [] as never[],
  archivedItems: [] as never[],
  navigate: vi.fn(),
  openEditor: vi.fn(),
  search: '',
}));
vi.mock('../../src/app-context', () => ({ useApp: () => boundary }));

beforeEach(() => {
  boundary.notes = [note()];
  boundary.plans = [plan];
  boundary.navigate.mockReset();
  boundary.openEditor.mockReset();
});
afterEach(cleanup);

describe('wiki chips', () => {
  it('navigatesResolvedChipsAndKeepsMissingOnesAsText', () => {
    render(<WikiText text="See [[p1|Launch]] and [[nope]]" />);
    const chip = screen.getByRole('button', { name: 'Launch' });
    fireEvent.click(chip);
    expect(boundary.navigate).toHaveBeenCalledWith('plan', 'p1');

    expect(screen.getByText('nope')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'nope' })).toBeNull();
  });

  it('listsReferrersForAnItem', () => {
    render(<Backlinks itemId="p1" />);
    expect(screen.getByText('Referenced by')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Referrer' })).toBeTruthy();
  });

  it('rendersNothingWithoutBacklinks', () => {
    render(<Backlinks itemId="missing" />);
    expect(screen.queryByText('Referenced by')).toBeNull();
  });
});
