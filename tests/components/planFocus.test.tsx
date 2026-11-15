import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanItem } from '../../shared/types';
import { PLAN_COLORS } from '../../shared/types';
import { PlanDetail } from '../../src/views/PlanDetail';

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
  summary: 'Ship the thing',
  status: 'active',
  targetDate: null,
  steps: [],
  color: PLAN_COLORS[0],
  pinned: false,
  scratchpad: 'old',
};

const boundary = vi.hoisted(() => ({
  update: vi.fn(),
  run: vi.fn(),
  navigate: vi.fn(),
  openEditor: vi.fn(),
  openReminder: vi.fn(),
  archiveItem: vi.fn(),
}));
vi.mock('../../src/app-context', () => ({
  useApp: () => ({
    view: { name: 'plan', id: 'p1' },
    plans: [plan],
    links: [],
    tasks: [],
    notes: [],
    navigate: boundary.navigate,
    openEditor: boundary.openEditor,
    openReminder: boundary.openReminder,
    api: { update: boundary.update, savePlanTemplate: vi.fn() },
    run: boundary.run,
    remindersById: new Map(),
    archiveItem: boundary.archiveItem,
  }),
}));

beforeEach(() => {
  boundary.update.mockReset().mockResolvedValue({});
  boundary.run.mockReset().mockImplementation(async (promise: Promise<unknown>) => promise);
});
afterEach(cleanup);

describe('plan focus mode', () => {
  it('hides secondary panels and saves the scratchpad on blur', async () => {
    render(<PlanDetail />);
    expect(document.querySelector('.detail-grid--focus')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    expect(document.querySelector('.detail-grid--focus')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Scratchpad' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Attached notes' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reminder' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Plan scratchpad'), { target: { value: 'new text' } });
    await act(async () => {
      fireEvent.blur(screen.getByLabelText('Plan scratchpad'));
    });
    expect(boundary.update).toHaveBeenCalledTimes(1);
    expect(boundary.update).toHaveBeenCalledWith('p1', { scratchpad: 'new text' });

    fireEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }));
    expect(document.querySelector('.detail-grid--focus')).toBeNull();
  });

  it('doesNotSaveAnUnchangedScratchpad', async () => {
    render(<PlanDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    await act(async () => {
      fireEvent.blur(screen.getByLabelText('Plan scratchpad'));
    });
    expect(boundary.update).not.toHaveBeenCalled();
  });
});
