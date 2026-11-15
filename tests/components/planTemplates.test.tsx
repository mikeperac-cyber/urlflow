import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, PlanTemplate } from '../../shared/types';
import { PlansView } from '../../src/views/Plans';
import { TemplateDialog } from '../../src/components/TemplateDialog';

const template: PlanTemplate = {
  id: 't1',
  name: 'Launch',
  summary: '',
  color: '#6d8bff',
  steps: [{ text: 'Prep', notes: '', dayOffset: 2 }],
  tasks: [{ title: 'Ship', notes: '', priority: 'normal', dayOffset: 0 }],
  linkIds: ['l1'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const boundary = vi.hoisted(() => ({
  plans: [] as unknown[],
  links: [] as unknown[],
  tasks: [] as unknown[],
  state: { planTemplates: [] as PlanTemplate[] },
  search: '',
  openTemplateDialog: vi.fn(),
  navigate: vi.fn(),
  openEditor: vi.fn(),
  pushToast: vi.fn(),
  run: vi.fn(),
  createPlanFromTemplate: vi.fn(),
  deletePlanTemplate: vi.fn(),
}));
vi.mock('../../src/app-context', () => ({
  useApp: () => ({
    ...boundary,
    api: {
      createPlanFromTemplate: boundary.createPlanFromTemplate,
      deletePlanTemplate: boundary.deletePlanTemplate,
    },
  }),
}));

beforeEach(() => {
  boundary.state = { planTemplates: [template] };
  boundary.run.mockImplementation(async (promise: Promise<unknown>) => promise);
  boundary.createPlanFromTemplate.mockReset().mockResolvedValue({
    state: { items: [] } as unknown as AppState,
    planId: 'p9',
  });
  boundary.deletePlanTemplate.mockReset();
  boundary.navigate.mockReset();
  boundary.openTemplateDialog.mockReset();
  boundary.openEditor.mockReset();
});
afterEach(cleanup);

describe('plan templates', () => {
  it('opensTheTemplateDialogFromPlans', () => {
    render(<PlansView />);
    fireEvent.click(screen.getByRole('button', { name: 'New from template' }));
    expect(boundary.openTemplateDialog).toHaveBeenCalledTimes(1);
  });

  it('createsAPlanFromTheChosenTemplateWithDates', async () => {
    const onClose = vi.fn();
    render(<TemplateDialog onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /^Launch/ }));
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'Q1 launch' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-15' } });
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-11-30' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    });

    expect(boundary.createPlanFromTemplate).toHaveBeenCalledWith('t1', {
      title: 'Q1 launch',
      startDate: '2026-11-15',
      endDate: '2026-11-30',
    });
    expect(boundary.navigate).toHaveBeenCalledWith('plan', 'p9');
    expect(onClose).toHaveBeenCalled();
  });
});
