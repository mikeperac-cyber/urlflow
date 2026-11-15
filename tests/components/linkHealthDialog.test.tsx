import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkHealthCheck, LinkItem } from '../../shared/types';
import { LinkHealthDialog } from '../../src/components/LinkHealthDialog';

function link(id: string, title: string): LinkItem {
  return {
    id,
    kind: 'link',
    title,
    notes: '',
    tags: [],
    planId: null,
    archivedAt: null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: `https://example.com/${id}`,
    favorite: false,
    readingState: 'unread',
    lastOpenedAt: null,
    snapshotAt: null,
  };
}

const context = vi.hoisted(() => ({
  healthDialog: [] as string[] | null,
  closeHealthDialog: vi.fn(),
  links: [] as LinkItem[],
  healthResults: {} as Record<string, LinkHealthCheck>,
  healthCheckedAt: null as string | null,
  healthRunning: false,
  runHealthCheck: vi.fn(),
  api: { openLink: vi.fn() },
  run: vi.fn(),
}));
vi.mock('../../src/app-context', () => ({ useApp: () => context }));

beforeEach(() => {
  context.links = [link('l1', 'Alpha'), link('l2', 'Beta')];
  context.healthDialog = [];
  context.healthResults = {};
  context.healthRunning = false;
  context.runHealthCheck.mockReset().mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe('link health dialog', () => {
  it('waitsForConfirmationBeforeCheckingAndListsBrokenLinksFirst', async () => {
    const view = render(<LinkHealthDialog />);
    expect(screen.getByText(/sends one request per link/)).toBeTruthy();
    expect(context.runHealthCheck).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check 2 links' }));
    });
    expect(context.runHealthCheck).toHaveBeenCalledWith(['l1', 'l2']);

    context.healthResults = {
      l1: { id: 'l1', status: 200, finalUrl: 'https://example.com/l1', checkedAt: '2026-11-15T00:00:00.000Z', permanent: false, message: 'HTTP 200' },
      l2: { id: 'l2', status: 404, finalUrl: 'https://example.com/l2', checkedAt: '2026-11-15T00:00:00.000Z', permanent: true, message: 'Not Found' },
    };
    view.rerender(<LinkHealthDialog />);
    expect(screen.getByText(/1 looks broken/)).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Beta');
    expect(rows[0].textContent).toContain('Error 404');
  });

  it('offersAllLinksWhenOpenedForASelection', async () => {
    context.healthDialog = ['l1'];
    render(<LinkHealthDialog />);
    expect(screen.getByText(/checks 1 of your 2 links/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check all 2' }));
    });
    expect(context.runHealthCheck).toHaveBeenCalledWith(['l1', 'l2']);
  });
});
