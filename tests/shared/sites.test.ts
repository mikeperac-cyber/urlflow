import { describe, expect, it } from 'vitest';
import { groupLinksByHost } from '../../shared/sites';
import { type LinkItem } from '../../shared/types';

function link(id: string, url: string, overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id, kind: 'link', title: id, url, readingState: 'unread', favorite: false,
    notes: '', tags: [], planId: null, archivedAt: null, reviewedAt: null,
    createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z', lastOpenedAt: null,
    ...overrides,
  };
}

describe('site groups', () => {
  it('groupsWwwAndBareHostTogether', () => {
    const www = link('www', 'https://www.Example.com/one');
    const bare = link('bare', 'https://example.com/two');
    expect(groupLinksByHost([www, bare])).toEqual([
      { host: 'example.com', links: [www, bare], unreadCount: 2, laterCount: 0 },
    ]);
  });

  it('countsUnreadAndLater', () => {
    const unread = link('unread', 'https://example.com/one');
    const later = link('later', 'https://example.com/two', { readingState: 'later' });
    const read = link('read', 'https://example.com/three', { readingState: 'read' });
    expect(groupLinksByHost([unread, later, read])).toEqual([
      { host: 'example.com', links: [unread, later, read], unreadCount: 1, laterCount: 1 },
    ]);
  });

  it('sortsHostsAndLinksWithoutMutatingTheInput', () => {
    const old = link('old', 'https://z.test/old', { createdAt: '2026-10-29T12:00:00.000Z' });
    const newest = link('newest', 'https://z.test/new');
    const firstHost = link('first', 'https://a.test');
    const input = [old, newest, firstHost];
    const groups = groupLinksByHost(input);
    expect(groups.map((group) => group.host)).toEqual(['a.test', 'z.test']);
    expect(groups[1].links.map((entry) => entry.id)).toEqual(['newest', 'old']);
    expect(input).toEqual([old, newest, firstHost]);
  });

  it('omitsArchivedLinksAndEmptyHosts', () => {
    const active = link('active', 'https://active.test');
    expect(groupLinksByHost([
      link('archived', 'https://archived.test', { archivedAt: '2026-10-30T12:00:00.000Z' }),
      link('invalid', 'https://'), active,
    ])).toEqual([{ host: 'active.test', links: [active], unreadCount: 1, laterCount: 0 }]);
  });
});
