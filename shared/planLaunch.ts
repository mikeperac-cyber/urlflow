import type { AppState, LinkItem } from './types';
import { isSafeExternalUrl } from './url';

/** Non-archived, safe web links attached to a plan, in the order they were saved. */
export function planLinksForLaunch(state: AppState, planId: string): LinkItem[] {
  return state.items
    .filter((item): item is LinkItem =>
      item.kind === 'link'
      && item.planId === planId
      && !item.archivedAt
      && isSafeExternalUrl(item.url))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
