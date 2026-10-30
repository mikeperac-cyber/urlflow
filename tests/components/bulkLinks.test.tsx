import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinksView } from '../../src/views/Links';
import { LinkCard } from '../../src/components/items';
import { createItem } from '../../shared/core';
import { emptyState, matchKey, type LinkItem, type PlanItem } from '../../shared/types';

const boundary = vi.hoisted(() => ({
  links: [] as LinkItem[], plans: [] as PlanItem[], search: '',
  matches: { duplicates: [] as { ids: string[] }[] },
  bulkTriage: vi.fn(), openLinks: vi.fn(), openEditor: vi.fn(), showUndoToast: vi.fn(),
}));
vi.mock('../../src/app-context', () => ({
  useApp: () => ({
    ...boundary,
    api: { bulkTriage: boundary.bulkTriage, openLinks: boundary.openLinks, readFavicon: async () => null },
    run: async (promise: Promise<unknown>) => promise.catch(() => null),
    remindersById: new Map(),
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  let state = emptyState();
  for (const title of ['Alpha', 'Beta', 'Gamma']) {
    state = createItem(state, { kind: 'link', title, url: `https://${title.toLowerCase()}.test`, tags: ['existing'] }).state;
  }
  state = createItem(state, { kind: 'plan', title: 'Launch' }).state;
  boundary.links = state.items.filter((item): item is LinkItem => item.kind === 'link');
  boundary.plans = state.items.filter((item): item is PlanItem => item.kind === 'plan');
  boundary.search = '';
  boundary.matches = { duplicates: [] };
  boundary.bulkTriage.mockResolvedValue(state);
  boundary.openLinks.mockResolvedValue(state);
});
afterEach(cleanup);

function checkbox(title: string) {
  return screen.getByRole('checkbox', { name: `Select ${title}` }) as HTMLInputElement;
}
async function clickAction(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name, exact: true })); });
}

describe('Links bulk selection', () => {
  it('keepsControlledSelectionAcrossSearchAndFiltersAndAddsVisibleWithoutDuplicates', async () => {
    const view = render(<LinksView />);
    fireEvent.click(checkbox('Alpha'));
    expect(checkbox('Alpha').checked).toBe(true);
    expect(boundary.openEditor).not.toHaveBeenCalled();
    boundary.search = 'Beta';
    view.rerender(<LinksView />);
    await clickAction('Select visible');
    await clickAction('Select visible');
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by reading state' }), { target: { value: 'later' } });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by reading state' }), { target: { value: 'all' } });
    boundary.search = '';
    view.rerender(<LinksView />);
    expect(checkbox('Alpha').checked).toBe(true);
    expect(checkbox('Beta').checked).toBe(true);
    expect(checkbox('Gamma').checked).toBe(false);
    await clickAction('Clear selection');
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(checkbox('Alpha').checked).toBe(false);
  });

  it('expandsAllPairsOfEveryIntersectingGroupAndDeduplicatesSortedKeys', async () => {
    const [a, b, c] = ['Alpha', 'Beta', 'Gamma'].map((title) => boundary.links.find((link) => link.title === title)!.id);
    boundary.matches.duplicates = [{ ids: [c, b, a, c] }, { ids: [a, b] }, { ids: ['other', 'unselected'] }];
    render(<LinksView />);
    fireEvent.click(checkbox('Alpha'));
    await clickAction('Ignore matches');
    expect(boundary.bulkTriage).toHaveBeenCalledExactlyOnceWith([a], {
      type: 'ignore-matches', keys: [matchKey(a, b), matchKey(a, c), matchKey(b, c)].sort(),
    });
    expect(boundary.showUndoToast).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('disablesIgnoreWithoutAnIntersectingDuplicateGroup', () => {
    boundary.matches.duplicates = [{ ids: boundary.links.filter((link) => link.title !== 'Alpha').map((link) => link.id) }];
    render(<LinksView />);
    fireEvent.click(checkbox('Alpha'));
    expect((screen.getByRole('button', { name: 'Ignore matches' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['Add tags', 'Assign plan', 'Clear plan', 'Archive', 'Open'])('usesOneBatchCallAndOneUndoToastFor%s', async (action) => {
    render(<LinksView />);
    await clickAction('Select visible');
    if (action === 'Add tags') fireEvent.change(screen.getByRole('textbox', { name: 'Tags to add' }), { target: { value: ' #New, new, Other, , ##Other ' } });
    if (action === 'Assign plan') fireEvent.change(screen.getByRole('combobox', { name: 'Plan for selected links' }), { target: { value: boundary.plans[0].id } });
    await clickAction(action);
    const ids = boundary.links.map((link) => link.id);
    if (action === 'Open') {
      expect(boundary.openLinks).toHaveBeenCalledExactlyOnceWith(ids);
      expect(boundary.bulkTriage).not.toHaveBeenCalled();
    } else {
      const payload = action === 'Add tags' ? { type: 'add-tags', tags: ['New', 'Other'] }
        : action === 'Archive' ? { type: 'archive' }
        : { type: 'assign-plan', planId: action === 'Clear plan' ? null : boundary.plans[0].id };
      expect(boundary.bulkTriage).toHaveBeenCalledExactlyOnceWith(ids, payload);
    }
    expect(boundary.showUndoToast).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('preservesSelectionAndDoesNotShowUndoWhenTheBatchFails', async () => {
    boundary.bulkTriage.mockRejectedValue(new Error('failed'));
    render(<LinksView />);
    fireEvent.click(checkbox('Alpha'));
    await clickAction('Archive');
    expect(checkbox('Alpha').checked).toBe(true);
    expect(boundary.showUndoToast).not.toHaveBeenCalled();
  });

  it('appliesTheBatchToSelectedLinksHiddenBySearch', async () => {
    const view = render(<LinksView />);
    fireEvent.click(checkbox('Alpha'));
    boundary.search = 'Beta';
    view.rerender(<LinksView />);
    await clickAction('Select visible');
    await clickAction('Archive');
    expect(boundary.bulkTriage).toHaveBeenCalledExactlyOnceWith(
      ['Alpha', 'Beta'].map((title) => boundary.links.find((link) => link.title === title)!.id),
      { type: 'archive' },
    );
  });

  it('preventsSelectionChangesAndDuplicateRequestsWhileTheBatchIsPending', async () => {
    let resolve!: (value: object) => void;
    boundary.bulkTriage.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<LinksView />);
    fireEvent.click(checkbox('Alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive', exact: true }));
    expect(checkbox('Alpha').disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear selection' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Select visible' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Archive', exact: true }));
    expect(boundary.bulkTriage).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(emptyState()); });
    expect(checkbox('Alpha').disabled).toBe(false);
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('doesNotExposeSelectionOnSharedCardsOutsideLinks', () => {
    render(<LinkCard link={boundary.links[0]} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
