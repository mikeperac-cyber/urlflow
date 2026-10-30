import type { AnyItem } from './types';
import { hostOf, normalizeUrl } from './url';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'as', 'my', 'your', 'our', 'how',
  'what', 'why', 'guide', 'link', 'page', 'site', 'http', 'https', 'www', 'com', 'org', 'net',
]);

export interface MatchPair {
  aId: string;
  bId: string;
  score: number;
  reason: string;
  kind: AnyItem['kind'];
}

export interface MatchGroup {
  ids: string[];
  score: number;
  reason: string;
  kind: AnyItem['kind'];
}

export interface MatchResult {
  duplicates: MatchGroup[];
  related: MatchPair[];
}

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function textOf(item: AnyItem): string {
  const parts: string[] = [item.title, item.notes, item.tags.join(' ')];
  if (item.kind === 'plan') parts.push(item.summary, item.steps.map((step) => step.text).join(' '));
  if (item.kind === 'link') parts.push(item.url);
  return parts.join(' ').slice(0, 4000);
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  if (shared === 0) return 0;
  const diceScore = (2 * shared) / (a.size + b.size);
  const containment = shared / Math.min(a.size, b.size);
  return Math.min(1, diceScore * 0.65 + containment * 0.35);
}

function trigrams(value: string): Set<string> {
  const clean = ` ${value.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 2; i += 1) set.add(clean.slice(i, i + 3));
  return set;
}

export function titleScore(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  const tokenSim = dice(tokensA, tokensB);
  const charSim = dice(trigrams(a), trigrams(b));
  return Math.min(1, tokenSim * 0.6 + charSim * 0.4);
}

export function scorePair(a: AnyItem, b: AnyItem): { score: number; reason: string } | null {
  if (a.kind !== b.kind) return null;
  if (a.kind === 'link' && b.kind === 'link') {
    const keyA = normalizeUrl(a.url).key;
    const keyB = normalizeUrl(b.url).key;
    if (keyA && keyA === keyB) return { score: 1, reason: 'Same URL' };
    const hostA = hostOf(a.url);
    const hostB = hostOf(b.url);
    const sameHost = hostA !== '' && hostA === hostB;
    const nameSim = titleScore(a.title, b.title);
    if (sameHost) {
      const pathA = (() => {
        try {
          return new URL(normalizeUrl(a.url).url).pathname.toLowerCase();
        } catch {
          return '';
        }
      })();
      const pathB = (() => {
        try {
          return new URL(normalizeUrl(b.url).url).pathname.toLowerCase();
        } catch {
          return '';
        }
      })();
      if (pathA && pathA === pathB) return { score: 0.94, reason: `Same page on ${hostA}` };
      const score = 0.48 + nameSim * 0.45;
      return score >= 0.55 ? { score, reason: `Same site (${hostA}) + similar name` } : null;
    }
    const urlSim = titleScore(displayPath(a.url), displayPath(b.url));
    const score = nameSim * 0.7 + urlSim * 0.3;
    return score >= 0.55 ? { score, reason: 'Similar title and address' } : null;
  }

  const score = titleScore(textOf(a), textOf(b));
  if (score < 0.55) return null;
  const reason =
    a.kind === 'task' ? 'Similar task wording' : a.kind === 'plan' ? 'Similar plan content' : 'Similar note content';
  return { score, reason };
}

function displayPath(url: string): string {
  try {
    return new URL(normalizeUrl(url).url).pathname.replace(/[-/_]+/g, ' ');
  } catch {
    return url;
  }
}

export function findMatches(items: AnyItem[], ignored: string[] = []): MatchResult {
  const ignoredSet = new Set(ignored);
  const active = items.filter((item) => !item.archivedAt);
  const pairs: MatchPair[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const result = scorePair(active[i], active[j]);
      if (!result) continue;
      if (ignoredSet.has([active[i].id, active[j].id].sort().join('|'))) continue;
      pairs.push({
        aId: active[i].id,
        bId: active[j].id,
        score: Number(result.score.toFixed(3)),
        reason: result.reason,
        kind: active[i].kind,
      });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  // Group near-duplicates with union-find so a whole cluster can be merged at once.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (const pair of pairs) {
    if (pair.score < 0.86) continue;
    const rootA = find(pair.aId);
    const rootB = find(pair.bId);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  const clusters = new Map<string, MatchGroup>();
  const byId = new Map(active.map((item) => [item.id, item]));
  for (const pair of pairs) {
    if (pair.score < 0.86) continue;
    const root = find(pair.aId);
    const existing = clusters.get(root);
    if (existing) {
      existing.ids.push(pair.bId);
      existing.score = Math.max(existing.score, pair.score);
    } else {
      clusters.set(root, {
        ids: [pair.aId, pair.bId],
        score: pair.score,
        reason: pair.reason,
        kind: pair.kind,
      });
    }
  }

  const duplicates = [...clusters.values()]
    .map((group) => ({ ...group, ids: [...new Set(group.ids)].filter((id) => byId.has(id)) }))
    .filter((group) => group.ids.length > 1)
    .sort((a, b) => b.score - a.score);

  const clustered = new Set(duplicates.flatMap((group) => group.ids));
  const related = pairs.filter(
    (pair) => pair.score < 0.86 && !(clustered.has(pair.aId) && clustered.has(pair.bId)),
  );

  return { duplicates, related };
}
