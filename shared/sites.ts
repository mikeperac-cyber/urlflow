import type { LinkItem } from './types';
import { hostOf } from './url';

export interface SiteGroup {
  host: string;
  links: LinkItem[];
  unreadCount: number;
  laterCount: number;
}

export function groupLinksByHost(links: LinkItem[]): SiteGroup[] {
  const groups = new Map<string, SiteGroup>();
  for (const link of links) {
    if (link.archivedAt) continue;
    const host = hostOf(link.url);
    if (!host) continue;
    let group = groups.get(host);
    if (!group) {
      group = { host, links: [], unreadCount: 0, laterCount: 0 };
      groups.set(host, group);
    }
    group.links.push(link);
    if (link.readingState === 'unread') group.unreadCount += 1;
    if (link.readingState === 'later') group.laterCount += 1;
  }
  const result = [...groups.values()].sort((a, b) => a.host < b.host ? -1 : a.host > b.host ? 1 : 0);
  for (const group of result) group.links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}
