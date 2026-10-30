import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../shared/core';
import { emptyState, type AppState, type LinkItem } from '../../shared/types';
import { AppProvider, useApp } from '../../src/app-context';
import { ReviewView } from '../../src/views/Review';

const boundary = vi.hoisted(() => ({ state: null as AppState | null, openLink: vi.fn(), markReviewed: vi.fn() }));
vi.mock('../../src/lib/api', async () => {
  const { browserApi } = await import('../../src/lib/browserApi');
  return { api: {
    ...browserApi,
    load: async () => boundary.state,
    openLink: (id: string) => boundary.openLink(id),
    markReviewed: (id: string) => boundary.markReviewed(id),
  }, errorMessage: (error: unknown) => String(error) };
});

function Harness() {
  const { state, toasts } = useApp();
  const link = state.items[0] as LinkItem | undefined;
  return <><ReviewView /><output aria-label="Link state">{link?.readingState}|{link?.reviewedAt ?? 'unreviewed'}</output>{toasts.map((toast) => <p key={toast.id}>{toast.message}</p>)}</>;
}
async function mount(readingState: 'unread' | 'later' = 'later') {
  boundary.state = core.createItem(emptyState(), { kind: 'link', title: 'Old page', url: 'https://example.com', readingState }).state;
  boundary.state.items[0].createdAt = '2026-09-01T12:00:00.000Z';
  render(<AppProvider><Harness /></AppProvider>);
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-10-30T12:00:00.000Z');
  boundary.openLink.mockReset();
  boundary.markReviewed.mockReset().mockImplementation(async (id: string) => (
    boundary.state = core.markReviewed(boundary.state!, id)
  ));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('review reading actions', () => {
  it('waitsForOpeningBeforeReviewingAndLeavesTheRenderedStateReadAndReviewed', async () => {
    let finish!: () => void;
    boundary.openLink.mockImplementation((id: string) => new Promise<AppState>((resolve) => {
      finish = () => {
        boundary.state = core.updateItem(boundary.state!, id, { readingState: 'read' });
        (boundary.state.items[0] as LinkItem).lastOpenedAt = new Date().toISOString();
        resolve(boundary.state);
      };
    }));
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Open link' }));
    expect(screen.getByLabelText('Link state').textContent).toBe('later|unreviewed');
    expect(boundary.markReviewed).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(screen.getByLabelText('Link state').textContent).toBe('read|2026-10-30T12:00:00.000Z');
    expect(screen.getByText('Nothing to review')).toBeTruthy();
  });

  it('leavesAFailedOpenInTheReviewQueue', async () => {
    boundary.openLink.mockRejectedValue(new Error('Could not open'));
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open link' })); });
    expect(boundary.markReviewed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Link state').textContent).toBe('later|unreviewed');
    expect(screen.getByRole('button', { name: 'Open link' })).toBeTruthy();
  });

  it('leavesANullLegacyOpenUnreviewedWithoutASuccessToast', async () => {
    boundary.openLink.mockResolvedValue(null);
    await mount();
    (boundary.state!.items[0] as LinkItem).url = 'javascript:1';
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open link' })); });
    expect(boundary.markReviewed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Link state').textContent).toBe('later|unreviewed');
    expect(screen.getByRole('button', { name: 'Open link' })).toBeTruthy();
    expect(screen.queryByText('Opened in your browser')).toBeNull();
  });

  it.each(['unread', 'later'] as const)('keepPreservesReadingState (%s)', async (readingState) => {
    await mount(readingState);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep' })); });
    expect(boundary.openLink).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Link state').textContent).toBe(`${readingState}|2026-10-30T12:00:00.000Z`);
    expect((boundary.state!.items[0] as LinkItem).lastOpenedAt).toBeNull();
    expect(screen.getByText('Nothing to review')).toBeTruthy();
  });
});
