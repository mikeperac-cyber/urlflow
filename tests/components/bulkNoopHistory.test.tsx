import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '../../src/app-context';
import { LinksView } from '../../src/views/Links';
import { browserApi } from '../../src/lib/browserApi';

vi.mock('../../src/lib/api', async () => {
  const { browserApi } = await import('../../src/lib/browserApi');
  return { api: browserApi, errorMessage: (error: unknown) => String(error) };
});

function Harness({ stale }: { stale: boolean }) {
  const { links, api, run, showUndoToast, toasts } = useApp();
  return <>
    <button onClick={async () => {
      const id = links[0].id;
      const result = await run(stale ? api.archive(id) : api.update(id, { notes: 'Previous edit' }));
      if (result) showUndoToast('Previous change saved');
    }}>Previous change</button>
    <LinksView />
    {toasts.map((toast) => <div key={toast.id}>{toast.message}
      {toast.action ? <button onClick={() => void toast.action!.perform()}>Undo {toast.message}</button> : null}
    </div>)}
  </>;
}

beforeEach(async () => {
  vi.useFakeTimers();
  while (await browserApi.undo()) { /* Start from the empty initial state. */ }
  await browserApi.create({ kind: 'link', title: 'Saved', url: 'https://example.com' });
  vi.spyOn(window, 'open').mockImplementation(() => { throw new Error('Cannot open'); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bulk no-op history', () => {
  it.each([true, false])('retainsSelectionAndThePreviousUndoToastWithoutOfferingFalseSuccess (stale=%s)', async (stale) => {
    render(<AppProvider><Harness stale={stale} /></AppProvider>);
    await act(async () => {});
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Saved' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Previous change', exact: true })); });
    const before = structuredClone(await browserApi.load());
    expect(screen.getByRole('button', { name: 'Undo Previous change saved' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: stale ? 'Archive' : 'Open', exact: true })); });
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(await browserApi.load()).toEqual(before);
    expect(screen.getAllByRole('button', { name: /^Undo / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Undo Previous change saved' })).toBeTruthy();
    expect(screen.queryByText(stale ? 'Selected links archived' : 'Selected links opened')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo Previous change saved' })); });
    const restored = (await browserApi.load()).items[0];
    expect(restored.archivedAt).toBeNull();
    expect(restored.notes).toBe('');
  });
});
