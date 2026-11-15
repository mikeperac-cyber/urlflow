import type { AnyItem, ItemKind } from './types';

export type WikiSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; id: string; label: string; resolved: boolean };

export interface BacklinkRef {
  id: string;
  kind: ItemKind;
  title: string;
}

const TOKEN = /\[\[([A-Za-z0-9_-]{1,64})(?:\|([^\]\n]{1,200}))?\]\]/g;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Splits text into plain runs and wiki tokens; archived items still resolve. */
export function tokenizeWikiLinks(text: string, items: AnyItem[]): WikiSegment[] {
  const known = new Set(items.map((item) => item.id));
  const segments: WikiSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: 'text', text: text.slice(last, index) });
    const id = match[1];
    const label = String(match[2] ?? id).trim() || id;
    segments.push({ type: 'link', id, label, resolved: known.has(id) });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/** Builds the stored token for an item, stripping characters that would break parsing. */
export function wikiLinkMarkup(item: AnyItem): string {
  const id = String(item.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'missing';
  const title = String(item.title ?? '').replace(/[|[\]\n]/g, '').trim().slice(0, 200) || id;
  return `[[${id}|${title}]]`;
}

/** Active items matching a query, prefix matches first. */
export function searchWikiTargets(query: string, items: AnyItem[], limit = 8): AnyItem[] {
  const needle = query.trim().toLowerCase();
  const scored: { item: AnyItem; score: number }[] = [];
  for (const item of items) {
    if (item.archivedAt) continue;
    if (!needle) {
      scored.push({ item, score: 0 });
      continue;
    }
    const title = item.title.toLowerCase();
    const haystack = [title, item.notes.toLowerCase(), item.tags.join(' ').toLowerCase()];
    if (item.kind === 'link') haystack.push(item.url.toLowerCase());
    if (item.kind === 'plan') haystack.push(item.summary.toLowerCase());
    const score = title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : 2;
    if (score === 2 && !haystack.some((value) => value.includes(needle))) continue;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) =>
      a.score - b.score
      || a.item.title.length - b.item.title.length
      || a.item.title.localeCompare(b.item.title))
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.item);
}

/** Returns the open `[[query` at the caret, or null when the token is closed. */
export function wikiQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const position = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, position);
  const start = before.lastIndexOf('[[');
  if (start < 0) return null;
  const between = before.slice(start + 2);
  if (between.includes(']]') || between.includes('|') || between.includes('\n') || between.includes('[')) {
    return null;
  }
  return { start, query: between };
}

/** Replaces the open query with a token and leaves the caret after a trailing space. */
export function insertWikiLink(
  text: string,
  caret: number,
  item: AnyItem,
): { text: string; caret: number } {
  const query = wikiQueryAt(text, caret);
  if (!query) return { text, caret };
  const markup = `${wikiLinkMarkup(item)} `;
  const position = Math.max(0, Math.min(caret, text.length));
  return {
    text: `${text.slice(0, query.start)}${markup}${text.slice(position)}`,
    caret: query.start + markup.length,
  };
}

/** Notes and plan summaries that reference an item, excluding the item itself. */
export function backlinksFor(itemId: string, items: AnyItem[]): BacklinkRef[] {
  if (!ID.test(itemId)) return [];
  const seen = new Set<string>();
  const refs: BacklinkRef[] = [];
  for (const item of items) {
    if (item.id === itemId || seen.has(item.id)) continue;
    const text = item.kind === 'plan' ? `${item.notes}\n${item.summary}` : item.notes;
    const pointsHere = [...text.matchAll(TOKEN)].some((match) => match[1] === itemId);
    if (!pointsHere) continue;
    seen.add(item.id);
    refs.push({ id: item.id, kind: item.kind, title: item.title });
  }
  return refs;
}
