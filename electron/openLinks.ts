import { isSafeExternalUrl } from '../shared/url';

/** A failed external open must not prevent the remaining selected links from opening. */
export async function openLinks(
  links: readonly { id: string; url?: string | null }[],
  opener: (url: string) => void | Promise<void>,
): Promise<string[]> {
  const successfulIds: string[] = [];
  for (const link of links) {
    if (!link.url || !isSafeExternalUrl(link.url)) continue;
    try {
      await opener(link.url);
      successfulIds.push(link.id);
    } catch {
      // Only fulfilled opens receive read/open metadata.
    }
  }
  return successfulIds;
}
