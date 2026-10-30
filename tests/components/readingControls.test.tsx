import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '../../src/app-context';
import { ItemDialog } from '../../src/components/ItemDialog';
import { LinkCard } from '../../src/components/items';
import { LinksView } from '../../src/views/Links';
import { emptyState, type AppState, type ItemDraft, type ItemPatch } from '../../shared/types';
import * as core from '../../shared/core';

const boundary = vi.hoisted(() => ({ state: null as AppState | null, update: vi.fn() }));
vi.mock('../../src/lib/api', async () => {
  const { browserApi } = await import('../../src/lib/browserApi');
  return { api: {
    ...browserApi,
    load: async () => boundary.state,
    create: async (draft: ItemDraft) => (boundary.state = core.createItem(boundary.state!, draft).state),
    update: (id: string, patch: ItemPatch) => boundary.update(id, patch),
    archive: async (id: string) => (boundary.state = core.setArchived(boundary.state!, id, true)),
    fetchMetadata: async () => null,
    readFavicon: async () => null,
  }, errorMessage: (error: unknown) => String(error) };
});

function Harness({ compact = false }: { compact?: boolean }) {
  const { links, openEditor, search, setSearch } = useApp();
  return <>
    <button onClick={() => openEditor({ kind: 'link' })}>New link</button>
    <input aria-label="Search links" value={search} onChange={(event) => setSearch(event.target.value)} />
    {compact ? links.map((link) => <LinkCard key={link.id} link={link} compact />) : <LinksView />}
    <ItemDialog />
  </>;
}
async function mount(compact = false) {
  render(<AppProvider><Harness compact={compact} /></AppProvider>);
  await act(async () => {});
}
function addLink(title: string, overrides: Partial<ItemDraft> = {}) {
  const created = core.createItem(boundary.state!, {
    kind: 'link', title, url: `https://example.com/${title}`, ...overrides,
  });
  boundary.state = created.state;
  return created.id;
}
function visibleTitles() {
  return screen.queryAllByRole('article').map((card) => within(card).getAllByRole('button')[0].textContent);
}

beforeEach(() => {
  vi.useFakeTimers();
  boundary.state = emptyState();
  boundary.update.mockReset().mockImplementation(async (id: string, patch: ItemPatch) => (
    boundary.state = core.updateItem(boundary.state!, id, patch)
  ));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('reading-state controls', () => {
  it.each([false, true])('updatesReadingStateThroughApiWithoutOpeningTheEditor (compact=%s)', async (compact) => {
    const id = addLink('Saved article', { readingState: 'later', description: 'Rich description', siteName: 'Example' });
    await mount(compact);
    const control = screen.getByRole('combobox', { name: 'Reading state for Saved article' }) as HTMLSelectElement;
    expect(control.value).toBe('later');
    fireEvent.click(control);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { fireEvent.change(control, { target: { value: 'read' } }); });
    expect(boundary.update).toHaveBeenCalledExactlyOnceWith(id, { readingState: 'read' });
    expect(control.value).toBe('read');
    expect(boundary.state!.items[0]).toMatchObject({ readingState: 'read', description: 'Rich description', siteName: 'Example' });
  });

  it('filtersReadingStatesIndependentlyAndResetsTheReadingFilter', async () => {
    addLink('Unread article');
    addLink('Later article', { readingState: 'later' });
    addLink('Read article', { readingState: 'read' });
    const archived = addLink('Archived article', { readingState: 'later' });
    boundary.state = core.setArchived(boundary.state!, archived, true);
    await mount();
    const filter = screen.getByRole('combobox', { name: 'Filter by reading state' });
    expect(visibleTitles()).toHaveLength(3);
    for (const [state, title] of [['unread', 'Unread article'], ['later', 'Later article'], ['read', 'Read article']]) {
      fireEvent.change(filter, { target: { value: state } });
      expect(visibleTitles()).toEqual([title]);
    }
    fireEvent.change(filter, { target: { value: 'later' } });
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Reading state for Later article' }), { target: { value: 'read' } });
    });
    expect(screen.getByText('No links match')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect((filter as HTMLSelectElement).value).toBe('all');
    expect(visibleTitles()).toHaveLength(3);
  });

  it('combinesReadingStateWithFavoritesUnfiledTagsSearchAndSort', async () => {
    const plan = core.createItem(boundary.state!, { kind: 'plan', title: 'Research plan' });
    boundary.state = plan.state;
    addLink('Zebra article', { readingState: 'later', favorite: true, tags: ['research'], notes: 'needle' });
    addLink('Alpha article', { readingState: 'later', favorite: true, tags: ['research'], notes: 'needle' });
    addLink('Filed article', { readingState: 'later', favorite: true, tags: ['research'], notes: 'needle', planId: plan.id });
    addLink('No favorite', { readingState: 'later', tags: ['research'], notes: 'needle' });
    addLink('Wrong tag', { readingState: 'later', favorite: true, tags: ['other'], notes: 'needle' });
    addLink('Wrong search', { readingState: 'later', favorite: true, tags: ['research'] });
    addLink('Wrong state', { readingState: 'read', favorite: true, tags: ['research'], notes: 'needle' });
    await mount();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by reading state' }), { target: { value: 'later' } });
    fireEvent.click(screen.getByRole('tab', { name: /Favourites/ }));
    fireEvent.click(screen.getByRole('button', { name: /#research/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search links' }), { target: { value: 'needle' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort links' }), { target: { value: 'title' } });
    expect(visibleTitles()).toEqual(['Alpha article', 'Filed article', 'Zebra article']);
    fireEvent.click(screen.getByRole('tab', { name: /Unfiled/ }));
    expect(visibleTitles()).toEqual(['Alpha article', 'No favorite', 'Zebra article']);
  });

  it('preservesTheSelectedStateWhileEditingLinkFields', async () => {
    const id = addLink('Saved article', { readingState: 'later' });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
    const dialog = screen.getByRole('dialog');
    const control = within(dialog).getByRole('combobox', { name: 'Reading state' }) as HTMLSelectElement;
    expect(control.value).toBe('later');
    for (const [label, value] of [['Title', 'Edited title'], ['Notes', 'Edited notes'], ['Tags', 'research, reading'], ['Web address', 'https://changed.test']]) {
      fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' })); });
    expect(boundary.update).toHaveBeenLastCalledWith(id, expect.objectContaining({ readingState: 'later' }));
    expect(boundary.state!.items[0]).toMatchObject({
      title: 'Edited title', notes: 'Edited notes', tags: ['research', 'reading'],
      url: 'https://changed.test/', readingState: 'later',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Reading state' }), { target: { value: 'read' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
    expect(boundary.state!.items[0]).toMatchObject({ readingState: 'read' });
  });

  it('createsLinksWithTheChosenReadingState', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'New link' }));
    const dialog = screen.getByRole('dialog');
    const control = within(dialog).getByRole('combobox', { name: 'Reading state' }) as HTMLSelectElement;
    expect(control.value).toBe('unread');
    fireEvent.change(control, { target: { value: 'later' } });
    fireEvent.change(within(dialog).getByLabelText(/^Web address/), { target: { value: 'https://example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create link' })); });
    expect(boundary.state!.items[0]).toMatchObject({ readingState: 'later' });
  });
});
