import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowApi, LinkItem } from '../../shared/types';

const now = '2026-10-30T12:00:00.000Z';
let api: FlowApi;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  localStorage.clear();
  vi.spyOn(window, 'open').mockReturnValue(null);
  api = (await import('../../src/lib/browserApi')).browserApi;
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

describe('browser link opening', () => {
  it.each(['unread', 'later'] as const)('recordsReadAndOpenedTogetherAndPreservesReview (%s)', async (readingState) => {
    const created = await api.create({ kind: 'link', title: 'Saved page', url: 'https://example.com', readingState });
    const id = created.items[0].id;
    const changes: unknown[] = [];
    const off = api.onState((state) => changes.push(state.items[0]));
    const opening = api.openLink(id);
    const reviewing = api.markReviewed(id);
    await Promise.all([opening, reviewing]);

    expect(window.open).toHaveBeenCalledExactlyOnceWith('https://example.com/', '_blank', 'noopener,noreferrer');
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ readingState: 'read', lastOpenedAt: now });
    const final = await api.load();
    expect(final.items[0]).toMatchObject({ readingState: 'read', lastOpenedAt: now, reviewedAt: now });
    expect(JSON.parse(localStorage.getItem('url-flow:data:v1')!).items[0])
      .toMatchObject({ readingState: 'read', lastOpenedAt: now, reviewedAt: now });
    off();
  });

  it('doesNotRecordAnOpenWhenWindowOpenThrows', async () => {
    const created = await api.create({ kind: 'link', title: 'Saved page', url: 'https://example.com', readingState: 'later' });
    vi.mocked(window.open).mockImplementation(() => { throw new Error('Could not open'); });
    await expect(api.openLink(created.items[0].id)).rejects.toThrow('Could not open');
    expect(await api.load()).toEqual(created);
  });

  it('ignoresUnsafeMissingAndNonLinkTargets', async () => {
    const created = await api.create({ kind: 'link', title: 'Saved page', url: 'https://example.com' });
    const item = created.items[0] as LinkItem;
    item.url = 'javascript:alert(1)';
    const before = JSON.stringify(created);
    await api.openLink(item.id);
    await api.openLink('missing');
    expect(JSON.stringify(await api.load())).toBe(before);
    const noteState = await api.create({ kind: 'note', title: 'A note' });
    const note = noteState.items.find((entry) => entry.kind === 'note')!;
    await api.openLink(note.id);
    expect(await api.load()).toEqual(noteState);
    expect(window.open).not.toHaveBeenCalled();
  });
});
