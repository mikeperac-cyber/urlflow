# URL Cleaner and Auto-Tag Rules Implementation Plan (v1.2.0 Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every captured URL canonical and let domain/regex rules add tags automatically, all through the existing 40-step undo history.

**Architecture:** `shared/url.ts` becomes the single canonicalizer used by capture, imports and duplicate matching; its `key` stops lower-casing paths and queries. `AppState` grows to version 2 with a `tagRules` array that `shared/core.ts` applies in `createItem`, `importBookmarks` and the later batch API, while a Settings panel edits and tests rules through one validated IPC call.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Vitest 5, esbuild, electron-builder.

**Spec:** `docs/superpowers/specs/2026-11-15-url-flow-v1.2.0-feature-suite.md` - section 1 and the architectural guardrails.

## Global Constraints

- `AppState.version` is `2`. Version 1 files load with new fields defaulted and are rewritten as version 2; items, reminders and `ignoredMatches` are preserved exactly.
- `url-flow-data.json` holds only small values: no HTML, Markdown blobs or absolute cache paths.
- Every mutation goes through `Store.commit` (Electron) or `browserApi.mutate` (browser preview) so Undo/Redo keeps working.
- Tracking parameters stripped: any `utm_*` prefix, `fbclid`, `gclid`, `msclkid`, `mc_cid`, `mc_eid`, `ref`, `igshid`, `si`. Matching is exact or documented-prefix only; a parameter such as `refresh` or `pageSize` is functional and must survive.
- Functional parameters (`v`, `q`, `page`, anything not in the strip list) are preserved.
- Hosts are lower-cased. Path and query case are preserved in both `url` and `key`. Default ports `:80`/`:443` and a trailing slash (except the root path) are removed.
- Rule limits: at most 100 rules, 20 tags per rule, pattern of at most 300 characters, tag of at most 32 characters, at most 20 tags per item.
- Rules apply to new links only (capture, extension, import); editing a rule never retags existing links.
- ASCII-only source text; follow existing panel/`settings-row`/`Switch` conventions.

## Review Focus

- A functional parameter whose name merely starts with a stripped name (`refresh=1`, `pageSize=50`, `reference=x`) must survive capture and duplicate comparison - test in Task 2.
- `/Docs` and `/docs` on the same host must not be duplicates, while `WWW.Example.com` and `example.com` still fold to one host - test in Task 2.
- A stored regex rule with an invalid pattern must be skipped at match time instead of throwing during capture or import - test in Task 3.
- A malformed URL typed into capture must be stored as entered (never throw from `normalizeUrl`) and must not crash matching - test in Task 2.
- A version 1 data file with no `tagRules`/`planTemplates` keys must load with every item and be rewritten as version 2 without touching `updatedAt` - test in Task 1.

---

## File Map

- `shared/types.ts` owns `TagRule`, `CURRENT_STATE_VERSION`, the version 2 `AppState`, and the `FlowApi.saveTagRules` signature.
- `shared/tags.ts` (new) owns `cleanTags`, extracted from `shared/core.ts` so rule code and item code share one sanitizer.
- `shared/tagRules.ts` (new) owns rule normalization and matching; no Electron or React imports.
- `shared/url.ts` owns canonicalization for capture, imports and `shared/matching.ts`.
- `shared/core.ts` applies rule tags in `createItem` and `importBookmarks`, and normalizes `tagRules` in `normalizeState`.
- `electron/store.ts` persists a migrated file once on first load.
- `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts` expose the single `tagRules:save` operation.
- `src/views/Settings.tsx` and `src/styles.css` add the Rules panel.
- Tests live in `tests/shared/url.test.ts` (modified), `tests/shared/tagRules.test.ts`, `tests/shared/tagRulesApply.test.ts`, `tests/shared/migration.test.ts`, `tests/electron/storeMigration.test.ts`, `tests/components/tagRulesSettings.test.tsx`.

### Task 1: Version 2 state schema and migration

**Files:**
- Modify: `shared/types.ts` (`AppState`, `emptyState`, new `CURRENT_STATE_VERSION`, `TagRule`)
- Modify: `shared/core.ts` (`normalizeState`)
- Modify: `electron/store.ts` (constructor)
- Test: `tests/shared/migration.test.ts` (create), `tests/electron/storeMigration.test.ts` (create, `// @vitest-environment node`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CURRENT_STATE_VERSION: 2`; `interface TagRule { id: string; pattern: string; matchType: 'domain' | 'regex'; tags: string[]; enabled: boolean }`; `AppState` gains `version: number; tagRules: TagRule[]` plus (added here as empty defaults for later phases) `planTemplates: []` typed by `PlanTemplate` from Phase 4. Declare `planTemplates: PlanTemplate[]` and the `PlanTemplate` interfaces now so only Phase 4 fills them in.

- [ ] **Step 1: Write the failing migration test**

```ts
const legacy = { version: 1, items: [{ id: 'l1', kind: 'link', title: 'Legacy', notes: 'n', tags: ['x'], planId: null, archivedAt: null, reviewedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', url: 'https://example.com/a', favorite: false, readingState: 'unread', lastOpenedAt: null }], reminders: [], ignoredMatches: [] };
const migrated = normalizeState(legacy);
expect(migrated.version).toBe(2);
expect(migrated.tagRules).toEqual([]);
expect(migrated.planTemplates).toEqual([]);
expect(migrated.items).toHaveLength(1);
expect(migrated.items[0].updatedAt).toBe('2026-01-02T00:00:00.000Z');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/shared/migration.test.ts`
Expected: FAIL because `normalizeState` returns version 1 and has no `tagRules`.

- [ ] **Step 3: Add the schema and normalization**

Add `TagRule` and `CURRENT_STATE_VERSION = 2` to `shared/types.ts`; `emptyState()` returns `{ version: CURRENT_STATE_VERSION, items: [], reminders: [], ignoredMatches: [], tagRules: [], planTemplates: [] }`. In `normalizeState`, return `version: CURRENT_STATE_VERSION`, `tagRules: []` (Task 3 replaces this with validation) and `planTemplates: []`.

- [ ] **Step 4: Make the store rewrite a migrated file without history**

In the `Store` constructor, after `this.state = this.read()`, read the on-disk `version` (if the file exists) and call `this.persist()` once when it is below `CURRENT_STATE_VERSION`, so the next launch reads version 2. Assert in `tests/electron/storeMigration.test.ts` that a temp directory containing a version 1 file is version 2 after `new Store(dir)` and that `store.status()` is `{ canUndo: false, canRedo: false }`.

- [ ] **Step 5: Run the tests**

Run: `npm test -- --run tests/shared/migration.test.ts tests/electron/storeMigration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/core.ts electron/store.ts tests/shared/migration.test.ts tests/electron/storeMigration.test.ts
git commit -m "feat: migrate workspace data to schema version 2"
```

### Task 2: Canonical URL cleaner for capture, import and matching

**Files:**
- Modify: `shared/url.ts`, `shared/core.ts` (no signature change expected), `shared/matching.ts` (no change expected; verify it uses `normalizeUrl` only)
- Test: `tests/shared/url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeUrl(input: unknown): { url: string; key: string }` where `key` is the same string as `url` for parsed URLs and the raw input for unparsable ones; `isTrackingParam(name: string): boolean`.

- [ ] **Step 1: Add the failing tests**

```ts
it('keepsFunctionalParamsAndStripsTrackingParams', () => {
  expect(normalizeUrl('https://example.com/watch?v=abc&utm_campaign=x&ref=feed&si=token&page=2&refresh=1').url)
    .toBe('https://example.com/watch?page=2&refresh=1&v=abc');
});

it('preservesPathAndQueryCaseWhileFoldingHostAndDefaultPort', () => {
  const normalized = normalizeUrl('HTTP://WWW.Example.com:80/Docs/Page/?Q=AbC#top');
  expect(normalized).toEqual({ url: 'http://example.com/Docs/Page?Q=AbC', key: 'http://example.com/Docs/Page?Q=AbC' });
});
it('keepsUnparsableInputVerbatimInUrlAndKey', () => {
  expect(normalizeUrl('https://[broken')).toEqual({ url: 'https://[broken', key: 'https://[broken' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/url.test.ts`
Expected: FAIL on the second test because `key` is currently lower-cased (`/docs/page?q=abc`).

- [ ] **Step 3: Implement the cleaner**

Export `isTrackingParam` (exact membership in `TRACKING_PARAMS`, case-insensitive, plus `utm_` prefix) and use it in the filter. Return `{ url, key: url }` for parsed URLs and `{ url: raw, key: raw }` for the fallback branch. Keep parameter sorting by name, default-port removal, trailing-slash removal, and the `www.` host fold unchanged.

- [ ] **Step 4: Run the URL and matching tests**

Run: `npm test -- --run tests/shared/url.test.ts tests/shared/matching.test.ts tests/shared/enrichedLinks.test.ts`
Expected: PASS (matching scores change only where URLs differed by case; update an expectation only if a test asserted the old lower-cased key).

- [ ] **Step 5: Commit**

```bash
git add shared/url.ts tests/shared/url.test.ts
git commit -m "fix: keep URL path and query case in the canonical key"
```

### Task 3: Auto-tag rules engine

**Files:**
- Create: `shared/tags.ts`, `shared/tagRules.ts`
- Modify: `shared/core.ts` (import `cleanTags` from `shared/tags.ts`; delete the local copy)
- Test: `tests/shared/tagRules.test.ts` (create)

**Interfaces:**
- Consumes: `TagRule` from Task 1, `hostOf`/`normalizeUrl` from Task 2.
- Produces:
  - `cleanTags(tags: unknown): string[]` in `shared/tags.ts` (same behavior as the current private helper in `shared/core.ts`).
  - `normalizeTagRules(raw: unknown): TagRule[]` in `shared/tagRules.ts` - drops malformed rules, trims patterns, runs `cleanTags` on `tags`, keeps at most 100 rules and only `'domain' | 'regex'` match types.
  - `ruleMatches(rule: TagRule, url: string): boolean` - `enabled` rules only; `domain` compares the lower-cased pattern with the scheme, `www.`, path and trailing slash removed against the host or a `.`-suffix subdomain; `regex` compiles `new RegExp(rule.pattern, 'i')` inside `try/catch` against the raw URL and returns `false` on a syntax error.
  - `tagsForUrl(url: string, rules: TagRule[]): string[]` - concatenates matching rule tags in rule order and passes them through `cleanTags`.

- [ ] **Step 1: Write the failing tests**

```ts
it('matchesDomainRulesOnSubdomains', () => {
  expect(tagsForUrl('https://gist.github.com/a', [rule({ pattern: 'https://www.github.com/', matchType: 'domain', tags: ['code'] })]))
    .toEqual(['code']);
});
it('skipsInvalidRegexWithoutThrowing', () => {
  expect(tagsForUrl('https://example.com/a', [rule({ pattern: '([', matchType: 'regex', tags: ['bad'] })])).toEqual([]);
});
it('mergesRuleTagsWithUserTagsWithoutDuplicates', () => {
  expect(cleanTags(['Docs', ...tagsForUrl('https://docs.example.com', [rule({ pattern: 'example.com', matchType: 'domain', tags: ['docs', 'reading'] })])]))
    .toEqual(['Docs', 'reading']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/tagRules.test.ts`
Expected: FAIL because `shared/tagRules.ts` does not exist.

- [ ] **Step 3: Implement the module**

Move `cleanTags` verbatim into `shared/tags.ts` and update imports in `shared/core.ts`. Implement `normalizeTagRules`, `ruleMatches`, `tagsForUrl` as specified; give each normalized rule a `newId()` when `id` is missing or malformed. Wire `tagRules: normalizeTagRules(source.tagRules)` into `normalizeState` so stored rules are validated on every load.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/tagRules.test.ts && npm run typecheck`
Expected: tests PASS and both TypeScript projects PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/tags.ts shared/tagRules.ts shared/core.ts tests/shared/tagRules.test.ts
git commit -m "feat: add auto-tag rule matching engine"
```

### Task 4: Apply rules at capture/import and persist rules through one IPC call

**Files:**
- Modify: `shared/types.ts` (`FlowApi.saveTagRules`), `shared/core.ts` (`createItem`, `importBookmarks`, `normalizeState` wiring), `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts`, `src/app-context.tsx` (no change if `run` already handles `AppState`)
- Test: `tests/shared/tagRulesApply.test.ts` (create)

**Interfaces:**
- Consumes: `tagsForUrl`, `normalizeTagRules` from Task 3; version 2 state from Task 1.
- Produces: `FlowApi.saveTagRules(rules: TagRule[]): Promise<AppState>`; `createItem` and `importBookmarks` output `tags = cleanTags([...userTags, ...tagsForUrl(url, state.tagRules)])`.

- [ ] **Step 1: Write the failing tests**

```ts
it('appliesRuleTagsToCapturedLinks', () => {
  const state = { ...emptyState(), tagRules: [rule({ pattern: 'github.com', matchType: 'domain', tags: ['code'] })] };
  const { state: next } = createItem(state, { kind: 'link', title: 'Repo', url: 'https://github.com/a/b', tags: ['work'] });
  expect(next.items[0].tags).toEqual(['work', 'code']);
});
it('appliesRuleTagsToImportedBookmarks', () => {
  const state = { ...emptyState(), tagRules: [rule({ pattern: 'news', matchType: 'regex', tags: ['daily'] })] };
  const result = importBookmarks(state, [{ url: 'https://example.com/news/1', title: 'One', folder: '' }], false);
  expect(result.state.items[0].tags).toEqual(['daily']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/tagRulesApply.test.ts`
Expected: FAIL with `[]` tags.

- [ ] **Step 3: Wire the rules in**

Apply rules after URL validation in `createItem`'s link branch, and per entry inside `importBookmarks` (rules run against the normalized URL). Use `normalizeTagRules` inside `normalizeState` so stored rules are validated on load. Add `ipcMain.handle('tagRules:save', ...)` that commits `{ ...store.get(), tagRules: normalizeTagRules(rules) }` with label `Updated tag rules`, expose it in `electron/preload.ts`, and mirror it in `browserApi` with `mutate`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- --run tests/shared/tagRulesApply.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/core.ts electron/main.ts electron/preload.ts src/lib/browserApi.ts tests/shared/tagRulesApply.test.ts
git commit -m "feat: apply auto-tag rules during capture and import"
```

### Task 5: Rules panel in Settings

**Files:**
- Modify: `src/views/Settings.tsx`, `src/styles.css`
- Test: `tests/components/tagRulesSettings.test.tsx` (create)

**Interfaces:**
- Consumes: `FlowApi.saveTagRules` (Task 4), `normalizeTagRules`, `tagsForUrl` (Task 3), `state.tagRules`.
- Produces: a `Rules` panel with rows for each rule and a `Test a URL` field; no new context API.

- [ ] **Step 1: Write the failing component test**

Mock `useApp` with one existing rule and `api.saveTagRules = vi.fn().mockResolvedValue(newState)`. Assert the panel heading `Auto-tag rules` exists, that changing the tags field and clicking `Save rules` calls `saveTagRules` with `[{ id: 'r1', pattern: 'github.com', matchType: 'domain', tags: ['code', 'docs'], enabled: true }]`, and that entering `https://github.com/x` in `Test a URL` and clicking `Test` renders `code, docs`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/components/tagRulesSettings.test.tsx`
Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Build the panel**

Keep a local `draft` copy of `state.tagRules` seeded from the store; render each rule as a row with pattern input, match-type select (`domain`/`regex`), tag input (comma separated), enabled checkbox labelled with the rule pattern, `Test` support at panel level, and a delete button. `Add rule` appends `{ id: crypto.randomUUID(), pattern: '', matchType: 'domain', tags: [], enabled: true }`. `Save rules` calls `run(api.saveTagRules(normalizeTagRules(draft)), { success: 'Tag rules saved' })`; disable it while saving or when unchanged. Add styles under the existing `settings`/`panel` tokens.

- [ ] **Step 4: Run the test and typecheck**

Run: `npm test -- --run tests/components/tagRulesSettings.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Settings.tsx src/styles.css tests/components/tagRulesSettings.test.tsx
git commit -m "feat: add auto-tag rules settings panel"
```

### Task 6: Version 1.2.0 metadata and full verification

**Files:**
- Modify: `package.json` (`"version": "1.2.0"`), `src/views/Settings.tsx` (two `URL Flow 1.1.0` strings), `README.md` (only if it names 1.1.0), `browser-extension/manifest.json` (leave version to Phase 2)
- Test: none new

**Interfaces:**
- Consumes: everything above.
- Produces: an app that reports 1.2.0 and a green baseline for Phases 2-4.

- [ ] **Step 1: Bump version strings**

Set `package.json` version to `1.2.0` and replace the `URL Flow 1.1.0` copy in the Updates and About panels with `URL Flow 1.2.0`. Search the README for `1.1.0` and update only version references, not feature descriptions.

- [ ] **Step 2: Run the full check**

Run: `npm test -- --run && npm run typecheck && npm run build`
Expected: all Vitest suites PASS, both TypeScript projects PASS, Vite and esbuild builds succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/views/Settings.tsx README.md
git commit -m "chore: release URL Flow 1.2.0 metadata"
```
