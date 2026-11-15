/** Trims, de-duplicates case-insensitively and caps an item's tag list. */
export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = String(raw ?? '').trim().replace(/^#+/, '');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag.slice(0, 32));
  }
  return out.slice(0, 20);
}
