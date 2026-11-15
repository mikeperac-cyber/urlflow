import { cleanTags } from './tags';
import type { TagRule, TagRuleMatch } from './types';
import { hostOf, normalizeUrl } from './url';

const MAX_RULES = 100;
const MAX_PATTERN = 300;
const MAX_RULE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function ruleId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Defensive reader for rules loaded from disk, a backup or the Settings panel. */
export function normalizeTagRules(raw: unknown): TagRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TagRule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const value = entry as Partial<TagRule>;
    const pattern = String(value.pattern ?? '').trim().slice(0, MAX_PATTERN);
    if (!pattern) continue;
    const tags = cleanTags(value.tags);
    if (tags.length === 0) continue;
    const matchType: TagRuleMatch = value.matchType === 'regex' ? 'regex' : 'domain';
    const id = typeof value.id === 'string' && MAX_RULE_ID.test(value.id) ? value.id : ruleId();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, pattern, matchType, tags, enabled: value.enabled !== false });
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

/** Reduces a domain pattern to a bare host: scheme, www, port, path and slash removed. */
function domainPattern(pattern: string): string {
  return pattern
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export function ruleMatches(rule: TagRule, url: string): boolean {
  if (!rule.enabled) return false;
  const pattern = rule.pattern.trim();
  if (!pattern) return false;

  if (rule.matchType === 'domain') {
    const host = hostOf(url);
    const target = domainPattern(pattern);
    if (!host || !target) return false;
    return host === target || host.endsWith(`.${target}`);
  }

  try {
    return new RegExp(pattern, 'i').test(url);
  } catch {
    // A stored pattern can become invalid after an edit; it must never break capture.
    return false;
  }
}

/** Rule tags in rule order, de-duplicated case-insensitively. */
export function tagsForUrl(url: string, rules: TagRule[]): string[] {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  const normalized = normalizeUrl(url).url;
  const target = normalized || String(url ?? '').trim();
  if (!target) return [];
  const tags: string[] = [];
  for (const rule of rules) {
    if (ruleMatches(rule, target)) tags.push(...rule.tags);
  }
  return cleanTags(tags);
}
