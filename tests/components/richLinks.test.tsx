import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '../../src/app-context';
import { ItemDialog } from '../../src/components/ItemDialog';
import { LinksView } from '../../src/views/Links';
import { emptyState, type AppState, type LinkMetadata } from '../../shared/types';
import * as core from '../../shared/core';

const boundary = vi.hoisted(() => ({
  fetchMetadata: vi.fn(), fetchTitle: vi.fn(), readFavicon: vi.fn(), readClipboard: vi.fn(),
  state: null as AppState | null,
  capture: null as ((payload: { url: string | null }) => void) | null,
}));
vi.mock('../../src/lib/api', async () => {
  const { browserApi } = await import('../../src/lib/browserApi');
  return { api: {
    ...browserApi,
    load: async () => boundary.state,
    create: async (draft: Parameters<typeof core.createItem>[1]) => (boundary.state = core.createItem(boundary.state!, draft).state),
    update: async (id: string, patch: Parameters<typeof core.updateItem>[2]) => (boundary.state = core.updateItem(boundary.state!, id, patch)),
    fetchMetadata: boundary.fetchMetadata, fetchTitle: boundary.fetchTitle,
    readFavicon: boundary.readFavicon, readClipboard: boundary.readClipboard,
    onCapture: (handler: typeof boundary.capture) => { boundary.capture = handler; return () => { boundary.capture = null; }; },
  }, errorMessage: (error: unknown) => String(error) };
});

const page: LinkMetadata = {
  title: 'A readable page', description: 'Useful page description', siteName: 'Example publication', faviconKey: 'a'.repeat(64),
};
function Harness() {
  const { openEditor } = useApp();
  return <><button onClick={() => openEditor({ kind: 'link' })}>New link</button><LinksView /><ItemDialog /></>;
}
async function mount() {
  render(<AppProvider><Harness /></AppProvider>);
  await act(async () => {});
}
async function settleMetadata() { await act(async () => { vi.advanceTimersByTime(400); }); }
function input(label: string) { return screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  boundary.state = emptyState();
  boundary.fetchMetadata.mockResolvedValue(page);
  boundary.readFavicon.mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('rich link integration', () => {
  it('previewsAndSavesMetadataWithoutOverwritingAnEditedTitle', async () => {
    await mount();
    fireEvent.click(screen.getByText('New link'));
    fireEvent.change(input('Web address'), { target: { value: 'example.com/article' } });
    await settleMetadata();
    expect(input('Title').value).toBe('A readable page');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Example publication')).toBeTruthy();
    expect(within(dialog).getByText('Useful page description')).toBeTruthy();
    fireEvent.change(input('Title'), { target: { value: 'My chosen title' } });
    boundary.fetchMetadata.mockResolvedValue({ ...page, title: 'Second page', siteName: 'Second site', description: 'Second description' });
    fireEvent.change(input('Web address'), { target: { value: 'second.test/article' } });
    expect(within(dialog).queryByText('Useful page description')).toBeNull();
    await settleMetadata();
    expect(input('Title').value).toBe('My chosen title');
    fireEvent.change(input('Notes'), { target: { value: 'Personal notes' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create link' })); });
    expect(boundary.state!.items[0]).toMatchObject({
      title: 'My chosen title', url: 'https://second.test/article', notes: 'Personal notes',
      description: 'Second description', siteName: 'Second site', faviconKey: 'a'.repeat(64),
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Second site')).toBeTruthy();
    expect(screen.getByText('Second description')).toBeTruthy();
    expect(screen.getByText('Personal notes')).toBeTruthy();
    expect(screen.getByText('second.test/article')).toBeTruthy();
  });

  it('doesNotRefillATitleTheUserClearedWhileMetadataWasPending', async () => {
    let resolve!: (value: LinkMetadata) => void;
    boundary.fetchMetadata.mockReturnValue(new Promise<LinkMetadata>((done) => { resolve = done; }));
    await mount();
    fireEvent.click(screen.getByText('New link'));
    fireEvent.change(input('Web address'), { target: { value: 'example.com' } });
    await settleMetadata();
    fireEvent.change(input('Title'), { target: { value: 'Draft title' } });
    fireEvent.change(input('Title'), { target: { value: '' } });
    await act(async () => { resolve(page); });
    expect(input('Title').value).toBe('');
    expect(screen.getByText('Useful page description')).toBeTruthy();
  });

  it('savesWhenMetadataFailsAndWhileARequestIsStillPending', async () => {
    boundary.fetchMetadata.mockRejectedValue(new Error('offline'));
    await mount();
    fireEvent.click(screen.getByText('New link'));
    fireEvent.change(input('Web address'), { target: { value: 'offline.test' } });
    await settleMetadata();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create link' })); });
    expect(boundary.state!.items[0]).toMatchObject({ title: 'offline.test', url: 'https://offline.test/' });
    fireEvent.click(screen.getByText('New link'));
    boundary.fetchMetadata.mockReturnValue(new Promise(() => {}));
    fireEvent.change(input('Web address'), { target: { value: 'pending.test' } });
    await settleMetadata();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create link' })); });
    expect(boundary.state!.items.some((item) => item.title === 'pending.test')).toBe(true);
  });

  it('keepsExistingEnrichmentOnFailureButClearsItWhenTheAddressChanges', async () => {
    boundary.state = core.createItem(emptyState(), { kind: 'link', url: 'example.com', title: 'Existing title', ...page }).state;
    boundary.fetchMetadata.mockRejectedValue(new Error('offline'));
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
    await settleMetadata();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
    expect(boundary.state!.items[0]).toMatchObject({ description: page.description, siteName: page.siteName, faviconKey: page.faviconKey });
    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
    fireEvent.change(input('Web address'), { target: { value: 'different.test' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
    expect(boundary.state!.items[0]).toMatchObject({ description: null, siteName: null, faviconKey: null });
  });

  it('clipboardPasteFetchesOnceAndCarriesThePreviewIntoTheDialog', async () => {
    boundary.readClipboard.mockResolvedValue('https://example.com/article');
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Paste from clipboard' })); });
    await settleMetadata();
    expect(boundary.fetchMetadata).toHaveBeenCalledExactlyOnceWith('https://example.com/article');
    expect(boundary.fetchTitle).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByText('Useful page description')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create link' })); });
    expect(boundary.state!.items[0]).toMatchObject({ title: page.title, description: page.description, siteName: page.siteName, faviconKey: page.faviconKey });
  });

  it('clipboardPasteStillOpensAndSavesWhenMetadataRejects', async () => {
    boundary.readClipboard.mockResolvedValue('https://offline.test/article');
    boundary.fetchMetadata.mockRejectedValue(new Error('offline'));
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Paste from clipboard' })); });
    await settleMetadata();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(boundary.fetchMetadata).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create link' })); });
    expect(boundary.state!.items[0]).toMatchObject({ title: 'offline.test', url: 'https://offline.test/article' });
  });

  it('updatesAPrefetchedTitleForANewAddressUntilTheUserEditsIt', async () => {
    boundary.readClipboard.mockResolvedValue('https://example.com/article');
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Paste from clipboard' })); });
    expect(input('Title').value).toBe('A readable page');
    boundary.fetchMetadata.mockResolvedValue({ ...page, title: 'New address title' });
    fireEvent.change(input('Web address'), { target: { value: 'new.test/article' } });
    await settleMetadata();
    expect(input('Title').value).toBe('New address title');
  });

  it('trayCaptureFetchesMetadataOnceAndSavesEvenOnFailure', async () => {
    await mount();
    await act(async () => { boundary.capture!({ url: 'https://example.com/article' }); });
    expect(boundary.fetchMetadata).toHaveBeenCalledExactlyOnceWith('https://example.com/article');
    expect(boundary.fetchTitle).not.toHaveBeenCalled();
    expect(boundary.state!.items[0]).toMatchObject({ description: page.description, siteName: page.siteName, faviconKey: page.faviconKey });
    boundary.fetchMetadata.mockRejectedValue(new Error('offline'));
    await act(async () => { boundary.capture!({ url: 'https://offline.test/article' }); });
    expect(boundary.state!.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'offline.test/article', url: 'https://offline.test/article' }),
    ]));
  });
});
