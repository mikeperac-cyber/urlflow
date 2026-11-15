# Offline Snapshots and Link Health Implementation Plan (v1.2.0 Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a link keep a readable Markdown copy on disk, and let the Links view tell working URLs from redirects and dead ones.

**Architecture:** A new `electron/snapshots.ts` owns the on-disk Markdown format under `%APPDATA%\URL Flow\snapshots\<linkId>.md`; `electron/snapshotCapture.ts` fetches HTML and converts Readability output through Turndown. Links store only `snapshotAt`. Health checks run in `electron/linkHealth.ts` with a five-worker pool and return ephemeral results the Links view holds in memory, so routine checks never add undo history.

**Tech Stack:** Electron 45, React 19, TypeScript 7, jsdom, `@mozilla/readability`, `turndown`, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-15-url-flow-v1.2.0-feature-suite.md` - section 3 and guardrail 2.

## Global Constraints

- No HTML or Markdown enters `url-flow-data.json`; a link records only `snapshotAt: string | null`.
- Snapshot files live at `<userData>/snapshots/<linkId>.md`; only ids matching `/^[A-Za-z0-9_-]{1,64}$/` may become paths.
- Snapshot writes are atomic (temp file + rename) and capped at 2 MB; HTML fetch is capped at 2 000 000 bytes; Markdown is capped at 400 000 characters.
- Readability runs with scripts and subresources disabled; no page script executes and no extra request is made while parsing.
- Snapshot saving and deleting are undoable state changes (`Store.commit`). Health checks are not state changes.
- Health: concurrency 5, 8-second timeout per link, `HEAD` then `GET` fallback, manual redirects (max 5 hops, each target must stay `http:`/`https:`).
- Health result is one of `ok` (2xx), `redirect` (a 301 or 308 hop led to a different final URL) or `broken` (404, 410, 5xx, DNS/timeout/unsafe target).
- New preference `autoSnapshotLinks` defaults to `false`.
- ASCII-only copy; reuse `Button`, `IconButton`, `Modal`, `toast` and `run` patterns.

## Review Focus

- A page with no extractable article must leave the link saved with no `snapshotAt` and no file behind; a reader opened for a missing file shows a message instead of throwing - test in Task 2 and Task 4.
- A link id such as `../../prefs` or `..\..\x` must never become a file path - test in Task 1.
- A `HEAD` that returns 405 or 501 must fall back to `GET` and still classify correctly; a request that never answers must resolve as `broken` after 8 seconds - test in Task 5.
- A redirect to `file:`/`javascript:` must never be requested and must classify as `broken` - test in Task 5.
- Permanently deleting a link removes its snapshot file, and Undo restores the link even though the file stays gone (the reader then reports the file missing) - test in Task 1 and Task 3.

---

## File Map

- `electron/snapshots.ts` (new) owns the file format, atomic writes, path validation, reads, deletes and orphan pruning.
- `electron/snapshotCapture.ts` (new) owns HTML -> Readability -> Turndown conversion and fetching.
- `electron/pageMetadata.ts` gains an exported bounded HTML fetch used by both metadata and snapshots.
- `shared/types.ts`, `shared/core.ts` own `snapshotAt`, `SnapshotContent`, `Preferences.autoSnapshotLinks`, `ItemDraft.saveSnapshot` and `setLinkSnapshot`.
- `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts` own the snapshot and health IPC surface.
- `src/components/SnapshotReader.tsx` (new), `src/components/items.tsx`, `src/views/Settings.tsx`, `src/components/ItemDialog.tsx` own the snapshot UI.
- `electron/linkHealth.ts` (new), `src/app-context.tsx`, `src/components/CommandPalette.tsx`, `src/views/Links.tsx`, `src/components/items.tsx` own the health UI.
- Tests: `tests/electron/snapshots.test.ts`, `tests/electron/snapshotCapture.test.ts`, `tests/shared/snapshotState.test.ts`, `tests/components/snapshotReader.test.tsx`, `tests/electron/linkHealth.test.ts`, `tests/components/linkHealth.test.tsx`.

### Task 1: Snapshot file store and link flag

**Files:**
- Modify: `shared/types.ts`, `shared/core.ts`
- Create: `electron/snapshots.ts`
- Test: `tests/electron/snapshots.test.ts` (`// @vitest-environment node`), `tests/shared/snapshotState.test.ts`

**Interfaces:**
- Consumes: version 2 normalization from Phase 1 Task 1.
- Produces:
  - `LinkItem.snapshotAt: string | null`; `interface SnapshotContent { markdown: string; savedAt: string; title: string; sourceUrl: string }`.
  - `setLinkSnapshot(state: AppState, id: string, savedAt: string | null): AppState` in `shared/core.ts` (updates `snapshotAt` and `updatedAt`; ignores non-link ids).
  - `snapshotFileName(linkId: string): string | null`, `writeSnapshot(userDataPath, linkId, { sourceUrl, title, markdown }): Promise<{ savedAt: string; bytes: number }>`, `readSnapshot(userDataPath, linkId): Promise<SnapshotContent | null>`, `deleteSnapshot(userDataPath, linkId): Promise<void>`, `pruneOrphanSnapshots(userDataPath, keepIds: ReadonlySet<string>): Promise<number>` in `electron/snapshots.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('roundTripsMarkdownWithMetadata', async () => {
  const saved = await writeSnapshot(dir, 'link_1', { sourceUrl: 'https://example.com/a', title: 'A "quoted" title', markdown: '# Head\n\nBody' });
  const read = await readSnapshot(dir, 'link_1');
  expect(read).toEqual({ sourceUrl: 'https://example.com/a', title: 'A "quoted" title', savedAt: saved.savedAt, markdown: '# Head\n\nBody' });
});
it('refusesIdsThatCouldEscapeTheSnapshotDirectory', async () => {
  for (const id of ['../../prefs', '..\\..\\x', 'a/b', 'a b', '']) {
    expect(snapshotFileName(id), id).toBeNull();
    expect(await readSnapshot(dir, id)).toBeNull();
  }
});
it('prunesOnlyOrphanedSnapshotFiles', async () => {
  await writeSnapshot(dir, 'keep', { sourceUrl: 'https://example.com', title: 'K', markdown: 'k' });
  await writeSnapshot(dir, 'drop', { sourceUrl: 'https://example.com', title: 'D', markdown: 'd' });
  expect(await pruneOrphanSnapshots(dir, new Set(['keep']))).toBe(1);
  expect(await readSnapshot(dir, 'drop')).toBeNull();
  await deleteSnapshot(dir, 'keep');
  expect(await readSnapshot(dir, 'keep')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/electron/snapshots.test.ts tests/shared/snapshotState.test.ts`
Expected: FAIL because `electron/snapshots.ts` and `snapshotAt` do not exist.

- [ ] **Step 3: Implement the store and field**

File format: `---\nsource: <JSON string>\ntitle: <JSON string>\ncaptured: <JSON string>\n---\n<markdown>`. `writeSnapshot` mkdirs the directory, writes `<linkId>.<random>.tmp`, renames over `<linkId>.md`, returns `{ savedAt: new Date().toISOString(), bytes }` and rejects markdown over 400 000 characters. `readSnapshot` requires the leading fence, parses only `source`/`title`/`captured`, requires a valid ISO timestamp and an `http:`/`https:` source, and returns `null` for any mismatch or a missing/oversized file. `pruneOrphanSnapshots` lists the directory and deletes only `^[A-Za-z0-9_-]{1,64}\.md$` files whose stem is not in `keepIds`.

Add `snapshotAt: null` to new links and normalize existing/imported links to `null` unless a string is stored. Extend `normalizeState` so `snapshotAt` survives a round trip.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/electron/snapshots.test.ts tests/shared/snapshotState.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/snapshots.ts shared/types.ts shared/core.ts tests/electron/snapshots.test.ts tests/shared/snapshotState.test.ts
git commit -m "feat: add on-disk link snapshot store"
```

### Task 2: Readability extraction and Markdown conversion

**Files:**
- Modify: `package.json`, `scripts/build-electron.mjs`, `electron/pageMetadata.ts`
- Create: `electron/snapshotCapture.ts`
- Test: `tests/electron/snapshotCapture.test.ts` (`// @vitest-environment node`)

**Interfaces:**
- Consumes: nothing from Task 1 except the `{ sourceUrl, title, markdown }` shape.
- Produces:
  - `htmlToMarkdown(html: string, url: string): { title: string; markdown: string } | null`
  - `captureSnapshotDocument(url: string): Promise<{ sourceUrl: string; title: string; markdown: string } | null>`
  - `fetchPageHtml(rawUrl: string, signal: AbortSignal, limit: number): Promise<{ html: string; finalUrl: string } | null>` exported from `electron/pageMetadata.ts`.

- [ ] **Step 1: Install dependencies**

Run: `npm install @mozilla/readability turndown && npm install -D @types/turndown && npm install jsdom@^30.1.3`
Expected: `jsdom` moves to `dependencies`; `package-lock.json` updates with no audit-blocking errors.

- [ ] **Step 2: Write the failing conversion test**

```ts
it('convertsArticleHtmlToMarkdownAndDropsScripts', () => {
  const html = `<html><head><title>Doc title</title></head><body><article>
    <h1>Getting started</h1>
    <p>Read this <strong>first</strong>, then continue with the longer explanation below so the extractor keeps the article.</p>
    <p>Second paragraph with <a href="https://example.com/ref">a reference link</a> and more words to keep the body substantial.</p>
    <script>window.secret = 1</script></article></body></html>`;
  const result = htmlToMarkdown(html, 'https://example.com/doc');
  expect(result?.markdown).toContain('# Getting started');
  expect(result?.markdown).toContain('**first**');
  expect(result?.markdown).not.toContain('window.secret');
});
it('returnsNullWhenNoArticleCanBeExtracted', () => {
  expect(htmlToMarkdown('<html><body></body></html>', 'https://example.com')).toBeNull();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --run tests/electron/snapshotCapture.test.ts`
Expected: FAIL because `electron/snapshotCapture.ts` does not exist.

- [ ] **Step 4: Implement the converter**

`htmlToMarkdown` builds `new JSDOM(html, { url })` with default (disabled) script and resource loading, runs `new Readability(dom.window.document).parse()`, returns `null` when there is no `content`, converts with `new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })`, trims, caps at 400 000 characters, and takes the title from Readability then `<title>` then the URL (300 max).

`captureSnapshotDocument` validates the URL with `isSafeExternalUrl`, creates an `AbortController` with a 15-second timer, calls `fetchPageHtml(url, controller.signal, 2_000_000)`, and returns `{ sourceUrl: finalUrl, ...htmlToMarkdown(html, finalUrl) }` or `null`.

Refactor `fetchPageMetadata` to call the new `fetchPageHtml(url, signal, HTML_LIMIT)` for its HTML read and keep the favicon logic unchanged.

- [ ] **Step 5: Build only the main process with jsdom external**

Add `'jsdom'` to the `external` array in `scripts/build-electron.mjs` so esbuild does not bundle `jsdom`. Keep `@mozilla/readability` and `turndown` bundled.

- [ ] **Step 6: Run the tests, typecheck and build**

Run: `npm test -- --run tests/electron/snapshotCapture.test.ts tests/electron/pageMetadataFetch.test.ts && npm run typecheck && npm run build`
Expected: PASS, and both builds succeed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/build-electron.mjs electron/pageMetadata.ts electron/snapshotCapture.ts tests/electron/snapshotCapture.test.ts
git commit -m "feat: extract readable article markdown for snapshots"
```

### Task 3: Snapshot IPC, auto-snapshot preference and cleanup

**Files:**
- Modify: `shared/types.ts`, `shared/preferences.ts`, `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts`, `src/components/ItemDialog.tsx`, `src/views/Settings.tsx`
- Test: `tests/shared/preferences.test.ts` (modify), `tests/shared/snapshotState.test.ts` (extend)

**Interfaces:**
- Consumes: store and converter from Tasks 1-2.
- Produces: `Preferences.autoSnapshotLinks: boolean` (default `false`); `ItemDraft.saveSnapshot?: boolean`; `FlowApi` methods
  - `saveSnapshot(id: string): Promise<{ state: AppState; savedAt: string; bytes: number }>`
  - `getSnapshot(id: string): Promise<SnapshotContent | null>`
  - `deleteSnapshot(id: string): Promise<AppState>`

- [ ] **Step 1: Write the failing preference test**

```ts
it('defaultsAutoSnapshotOffAndAcceptsOnlyBooleans', () => {
  expect(normalizePreferences(undefined).autoSnapshotLinks).toBe(false);
  expect(normalizePreferences({ autoSnapshotLinks: true }).autoSnapshotLinks).toBe(true);
  expect(normalizePreferences({ autoSnapshotLinks: 'yes' }).autoSnapshotLinks).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/shared/preferences.test.ts`
Expected: FAIL because the key is missing.

- [ ] **Step 3: Add the preference and IPC handlers**

Extend `Preferences`, `DEFAULT_PREFERENCES` and `normalizePreferences`. In `main.ts` add:
- `snapshot:save`: find the link or throw `That link no longer exists.`; `captureSnapshotDocument`; `writeSnapshot`; `commit(core.setLinkSnapshot(store.get(), id, savedAt), 'Saved an offline snapshot')`; return `{ state, savedAt, bytes }`; throw `Could not capture a readable snapshot for this page.` when extraction fails.
- `snapshot:get`: return `readSnapshot(userDataPath, id)` after checking the link exists.
- `snapshot:delete`: delete the file, then commit `setLinkSnapshot(..., null)` with label `Deleted an offline snapshot`.
- After `item:remove` commits, `void deleteSnapshot(userDataPath, id)` (a non-link id simply has no file).
- On `app.whenReady`, prune with the current link ids.
- In `item:create`, when the draft is a link and (`draft.saveSnapshot === true` or `prefs.autoSnapshotLinks`), commit the new link first, then attempt snapshot capture and, on success, commit `setLinkSnapshot(saved, id, savedAt)` labelled `Saved an offline snapshot`. A failed capture leaves the link saved.

Mirror the methods in `preload.ts`. In `browserApi.ts`, `getSnapshot` resolves `null`, while `saveSnapshot` and `deleteSnapshot` both throw `Offline snapshots are available in the desktop app.` so no browser-preview code path pretends a file exists.

- [ ] **Step 4: Add the UI options**

`ItemDialog`: when creating a new link, render a checkbox labelled `Save offline snapshot` defaulting to `prefs.autoSnapshotLinks`; set `draft.saveSnapshot` from it. Hide it when editing an existing link (the card action handles that case).

`Settings`: a switch row labelled `Save offline snapshots automatically` bound to `prefs.autoSnapshotLinks`, explaining that snapshots are stored as Markdown on this computer.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/preferences.test.ts tests/shared/snapshotState.test.ts tests/components/settingsPreferences.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/preferences.ts electron/main.ts electron/preload.ts src/lib/browserApi.ts src/components/ItemDialog.tsx src/views/Settings.tsx tests/shared/preferences.test.ts tests/shared/snapshotState.test.ts
git commit -m "feat: add snapshot capture IPC and auto-snapshot setting"
```

### Task 4: Reader modal and link card snapshot action

**Files:**
- Create: `src/components/SnapshotReader.tsx`
- Modify: `src/components/items.tsx`, `src/styles.css`
- Test: `tests/components/snapshotReader.test.tsx` (create)

**Interfaces:**
- Consumes: `FlowApi.getSnapshot`, `saveSnapshot`, `deleteSnapshot`, `copyText`; `LinkItem.snapshotAt`.
- Produces: `SnapshotReader({ linkId, onClose }: { linkId: string; onClose: () => void })`; `LinkCard` gains a `BookOpen` action shown only when `snapshotAt` is set.

- [ ] **Step 1: Write the failing component test**

Mock `useApp.api` with `getSnapshot: async () => ({ markdown: '# Cached', savedAt: '2026-11-01T10:00:00.000Z', title: 'Cached', sourceUrl: 'https://example.com' })` and `copyText: vi.fn()`. Assert the dialog shows `# Cached`, that clicking `Copy Markdown` calls `copyText('# Cached')`, and that a `Refresh` click calls `saveSnapshot` with the link id. A second test resolves `null` and asserts the text `No snapshot file was found for this link.`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/components/snapshotReader.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the reader**

Use `Modal size="lg"`, load on mount and on `linkId` change, show a loading line, render Markdown in `<pre className="snapshot-reader__body">` (no Markdown renderer dependency), and show `Captured <date> · <word count> words`. Actions: `Copy Markdown` (`api.copyText`), `Refresh` (`run(api.saveSnapshot(linkId))` then reload), `Delete` behind `Confirm` (`run(api.deleteSnapshot(linkId))` then `onClose`). Show `run` errors through the existing toast path.

In `LinkCard`, add `const [readerOpen, setReaderOpen] = useState(false)` and, in `link-card__head-actions`, a `BookOpen` IconButton labelled `Read offline snapshot` when `link.snapshotAt`, otherwise a `FileDown` IconButton labelled `Save offline snapshot` that calls `run(api.saveSnapshot(link.id), { success: 'Offline snapshot saved' })` (spec: the option sits on existing link cards). Render `{readerOpen ? <SnapshotReader linkId={link.id} onClose={() => setReaderOpen(false)} /> : null}`. Style with existing tokens.

- [ ] **Step 4: Run the test and typecheck**

Run: `npm test -- --run tests/components/snapshotReader.test.tsx tests/components/richLinks.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SnapshotReader.tsx src/components/items.tsx src/styles.css tests/components/snapshotReader.test.tsx
git commit -m "feat: add offline snapshot reader"
```

### Task 5: Link health engine and IPC

**Files:**
- Create: `electron/linkHealth.ts`
- Modify: `shared/types.ts`, `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts`
- Test: `tests/electron/linkHealth.test.ts` (`// @vitest-environment node`)

**Interfaces:**
- Consumes: `normalizeUrl` from Phase 1 Task 2.
- Produces:
  - `type LinkHealthStatus = 'ok' | 'redirect' | 'broken'`
  - `interface LinkHealthResult { id: string; url: string; status: LinkHealthStatus; httpStatus: number | null; finalUrl: string | null; checkedAt: string; reason: string | null }`
  - `checkLinkHealth(targets: { id: string; url: string }[], options?: { fetcher?: typeof fetch; concurrency?: number; timeoutMs?: number; now?: () => Date }): Promise<LinkHealthResult[]>`
  - `FlowApi.checkLinkHealth(ids: string[]): Promise<LinkHealthResult[]>`

- [ ] **Step 1: Write the failing tests**

```ts
it('classifiesOkRedirectAndBroken', async () => {
  const results = await checkLinkHealth(
    [{ id: 'a', url: 'https://example.com/ok' }, { id: 'b', url: 'https://example.com/old' }, { id: 'c', url: 'https://example.com/gone' }],
    { fetcher: fakeFetch({ 'https://example.com/ok': [200], 'https://example.com/old': [301], 'https://example.com/new': [200], 'https://example.com/gone': [404] }) },
  );
  expect(results.map((r) => [r.id, r.status, r.httpStatus])).toEqual([
    ['a', 'ok', 200], ['b', 'redirect', 200], ['c', 'broken', 404],
  ]);
  expect(results[1].finalUrl).toBe('https://example.com/new');
});
it('fallsBackToGetWhenHeadIsNotAllowed', async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push(init?.method ?? 'GET');
    return init?.method === 'HEAD' ? new Response(null, { status: 405 }) : new Response('ok', { status: 200 });
  });
  const [result] = await checkLinkHealth([{ id: 'a', url: 'https://example.com' }], { fetcher: fetcher as typeof fetch });
  expect(result.status).toBe('ok');
  expect(calls).toEqual(['HEAD', 'GET']);
});
it('neverExceedsFiveConcurrentRequests', async () => {
  let inFlight = 0;
  let peak = 0;
  const fetcher = vi.fn(async () => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return new Response(null, { status: 200 });
  });
  await checkLinkHealth(Array.from({ length: 12 }, (_, i) => ({ id: String(i), url: `https://example.com/${i}` })), { fetcher: fetcher as typeof fetch });
  expect(peak).toBeLessThanOrEqual(5);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/electron/linkHealth.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the checker**

Use a shared index cursor with five workers. Per target: reject non-`http(s)` URLs as `broken`/`invalid-url`; create an `AbortController` with `setTimeout(abort, 8000)`; send `HEAD` (`redirect: 'manual'`), and retry with `GET` when the status is 405 or 501. Follow `3xx` responses with a `location` up to five hops using `new URL(location, current)`, keeping only `http:`/`https:` targets (otherwise `broken`/`unsafe-redirect`). Track `sawPermanentRedirect` for 301/308 and the last status. Final classification: `2xx` plus a different normalized final URL and `sawPermanentRedirect` -> `redirect` with `finalUrl`; `2xx` -> `ok`; anything else -> `broken` with reason `http-<status>`, `timeout`, `network` or `too-many-redirects`. Clear the timeout in `finally`.

`main.ts` handles `link:health` by mapping the requested active link ids to `{ id, url }` and returning `checkLinkHealth(targets)`. `preload.ts` forwards it; `browserApi.checkLinkHealth` throws `Link health checks run in the desktop app.`

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/electron/linkHealth.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/linkHealth.ts shared/types.ts electron/main.ts electron/preload.ts src/lib/browserApi.ts tests/electron/linkHealth.test.ts
git commit -m "feat: add link health checker with redirect classification"
```

### Task 6: Health UI in Links, cards and the command palette

**Files:**
- Modify: `src/app-context.tsx`, `src/components/CommandPalette.tsx`, `src/views/Links.tsx`, `src/components/items.tsx`, `src/styles.css`
- Test: `tests/components/linkHealth.test.tsx` (create)

**Interfaces:**
- Consumes: `FlowApi.checkLinkHealth` (Task 5).
- Produces: context fields `healthRequestId: number` and `requestLinkHealth(): void`; `LinkCard` prop `health?: LinkHealthResult`.

- [ ] **Step 1: Write the failing component test**

Mock a context with two active links and `api.checkLinkHealth` resolving `[{ id: 'l1', url: 'https://example.com', status: 'redirect', httpStatus: 200, finalUrl: 'https://example.com/new', checkedAt: '2026-11-15T00:00:00.000Z', reason: null }]`. Click `Check link health`, assert the call received both ids and that a `Redirect` badge with an `Update to redirect URL` button appears; clicking it calls `api.update('l1', { url: 'https://example.com/new' })`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/components/linkHealth.test.tsx`
Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Implement the controls**

`app-context.tsx`: add `healthRequestId` state and `requestLinkHealth` that increments it and calls `navigate('links')`. `CommandPalette`: an Actions entry `Check link health` labelled with the `Activity` icon calling `requestLinkHealth`. `LinksView`: state `healthById: Map<string, LinkHealthResult>` and `checking`; an effect on `healthRequestId` (skip `0`) that checks the filtered ids through `run(api.checkLinkHealth(ids))`, fills the map, and toasts `Checked N links · B broken`; a toolbar button `Check link health` disabled while checking or when the filter is empty; pass `health={healthById.get(link.id)}` to each `LinkCard`.

`LinkCard`: when `health` exists, render `<span className={`health-badge health-badge--${health.status}`}>{health.status === 'ok' ? 'Okay' : health.status === 'redirect' ? 'Redirect' : 'Broken'}</span>` and, for redirect, a small `Update to redirect URL` button calling `run(api.update(link.id, { url: health.finalUrl }))`; for broken, `Archive broken link` calling `archiveItem(link.id, 'Broken link archived')`. Stop propagation on both.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/components/linkHealth.test.tsx tests/components/bulkLinks.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app-context.tsx src/components/CommandPalette.tsx src/views/Links.tsx src/components/items.tsx src/styles.css tests/components/linkHealth.test.tsx
git commit -m "feat: surface link health checks in the links view"
```

### Task 7: Packaging verification for snapshot dependencies

**Files:**
- Modify: `README.md` (only if install/packaging steps mention dependencies)
- Test: none new

**Interfaces:**
- Consumes: `jsdom` as a production dependency (Task 2).
- Produces: proof that `dist:local` still packages the main process with a runtime `jsdom`.

- [ ] **Step 1: Build the local package**

Run: `npm run dist:local`
Expected: exit 0 and `release/local/win-unpacked/resources/app.asar` exists.

- [ ] **Step 2: Confirm the runtime dependency is packaged**

Run: `npx --yes @electron/asar list release/local/win-unpacked/resources/app.asar | grep -m1 "node_modules/jsdom/package.json"`
Expected: one matching path (no output means `jsdom` was not packaged - move it back to bundled code or fix the `external`/dependency combination before continuing).

- [ ] **Step 3: Record the result**

Write the two command outcomes into the task notes or PR description. Commit only if Step 2 forced a change to dependencies or the build script, and commit only those files.
