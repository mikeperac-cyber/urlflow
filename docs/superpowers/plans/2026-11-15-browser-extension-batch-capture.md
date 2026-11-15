# Browser Extension Selection and Batch Capture Implementation Plan (v1.2.0 Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the unpacked Chrome/Edge extension send a highlighted selection, every open tab, or a tab group into URL Flow, creating links or a complete plan in one undoable step.

**Architecture:** A pure `browser-extension/tabs.js` module turns tabs into a validated batch payload and splits it into `urlflow://add` request URLs. Electron parses each request in `electron/deepLink.ts`, assembles chunks in a TTL-bounded `CaptureBatchAssembler`, and hands one `CapturePayload` with `mode: 'batch'` to the renderer, which calls a new atomic `createBatch` API that commits once.

**Tech Stack:** Chrome/Edge Manifest V3 (plain ES modules), Electron 45, React 19, TypeScript 7, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-15-url-flow-v1.2.0-feature-suite.md` - section 2.

## Global Constraints

- Extension stays build-free: plain `.js` ES modules loaded unpacked, no bundler, no remote code, no content scripts, no host permissions.
- A batch is at most 200 tabs, each URL must be `http:`/`https:` after `normalizeUrl`, titles clamp to 300 characters, tags go through `cleanTags`.
- All Electron state changes go through `Store.commit`; one batch produces exactly one undo entry.
- `url-flow-data.json` stores only link records: URLs, titles, tags, plan ids. No page text beyond the existing notes field.
- Request URLs target Windows protocol handoff, so each URL stays at or below 1800 characters and a batch is split into chunks with a 1200-character data slice.
- A batch is idempotent per `batchId` for 10 minutes: a re-delivered batch never duplicates links.
- Auto-tag rules from Phase 1 apply to every batch link; user-supplied batch tags merge with them without duplicates.
- ASCII-only copy and code; reuse the existing toast/undo patterns (`showUndoToast`, `run`).

## Review Focus

- Chunks delivered out of order, with a repeated chunk, still assemble exactly once; test in Task 3.
- An oversized or malformed batch (over 200 tabs, over 256 KB decoded JSON, non-object chunk) is rejected whole, with no partial items created - test in Task 1 and Task 3.
- A batch containing `javascript:` or `file:` entries saves the valid links, skips the unsafe ones, and reports the skipped count - test in Task 1.
- A selection with newlines and CRLF becomes a Markdown blockquote whose every line starts with `> `, capped at 2000 characters - test in Task 2.
- The same `batchId` delivered twice within 10 minutes creates no second set of links - test in Task 3.

---

## File Map

- `shared/types.ts` owns `CaptureMode`, `CapturePayload` additions, `BatchCaptureEntry`, `BatchCaptureRequest`, `BatchCaptureResult`, `FlowApi.createBatch`.
- `shared/batch.ts` (new) owns validation and base64url decoding shared by Electron and tests.
- `shared/capture.ts` (new) owns `selectionQuote`.
- `shared/core.ts` owns `createBatch(state, request)`, the single pure state change behind the IPC call.
- `browser-extension/tabs.js` (new) owns tab filtering, group shaping, batch building, encoding and URL chunking.
- `browser-extension/popup.html` and `popup.js` (new) own the toolbar UI.
- `browser-extension/service-worker.js`, `captureUrl.js`, `manifest.json`, `README.md` gain the selection menu, permissions and popup wiring.
- `electron/deepLink.ts` owns `parseBatchChunk` and the `selection` parameter.
- `electron/captureBatches.ts` (new) owns chunk assembly, TTL cleanup and the duplicate-batch guard.
- `electron/main.ts`, `electron/preload.ts`, `electron/captureQueue.ts` (type only) route batches; `src/app-context.tsx` consumes them; `src/lib/browserApi.ts` mirrors the API for the browser preview.
- Tests: `tests/shared/batch.test.ts`, `tests/shared/batchCreate.test.ts`, `tests/shared/capture.test.ts`, `tests/electron/batchAssembler.test.ts`, `tests/electron/deepLink.test.ts` (modify), `tests/browser-extension/tabs.test.ts` (create).

### Task 1: Batch payload contract and atomic creation

**Files:**
- Modify: `shared/types.ts`, `shared/core.ts`
- Create: `shared/batch.ts`
- Test: `tests/shared/batch.test.ts`, `tests/shared/batchCreate.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeUrl`/`isSafeExternalUrl` (Phase 1 Task 2), `cleanTags` and `tagRules` (Phase 1 Tasks 3-4).
- Produces:
  - `interface BatchCaptureEntry { url: string; title?: string }`
  - `type BatchCaptureRequest = ({ kind: 'links' } | { kind: 'plan'; title: string; color?: string }) & { entries: BatchCaptureEntry[]; tags?: string[]; batchId?: string }`
  - `interface BatchCaptureResult { state: AppState; added: number; skipped: number; planId: string | null; duplicated: boolean }`
  - `FlowApi.createBatch(request: BatchCaptureRequest): Promise<BatchCaptureResult>`
  - `parseBatchRequest(value: unknown): BatchCaptureRequest | null` and `decodeBatchPayload(data: string): BatchCaptureRequest | null` in `shared/batch.ts` (`MAX_BATCH_TABS = 200`, decoded JSON cap 256_000 characters).
  - `createBatch(state: AppState, request: BatchCaptureRequest): { state: AppState; ids: string[]; skipped: number; planId: string | null }` in `shared/core.ts`; `ids` are the created link ids (never the new plan id).

- [ ] **Step 1: Write the failing tests**

```ts
it('rejectsOversizedAndMalformedBatches', () => {
  const tooMany = { kind: 'links', entries: Array.from({ length: 201 }, () => ({ url: 'https://example.com' })) };
  expect(parseBatchRequest(tooMany)).toBeNull();
  expect(parseBatchRequest({ kind: 'plan', entries: [] })).toBeNull(); // plan needs a title
  expect(parseBatchRequest({ kind: 'links', entries: [{ url: 'https://example.com', title: 'x'.repeat(301) }] })?.entries[0].title)
    .toHaveLength(300);
});
it('keepsTabOrderAndSkipsUnsafeUrls', () => {
  const result = createBatch(emptyState(), {
    kind: 'links',
    entries: [{ url: 'https://a.example/1', title: 'One' }, { url: 'javascript:alert(1)' }, { url: 'https://b.example/2' }],
  });
  expect(result.skipped).toBe(1);
  expect(result.state.items.map((item) => item.kind === 'link' && item.url)).toEqual([
    'https://a.example/1', 'https://b.example/2',
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/batch.test.ts tests/shared/batchCreate.test.ts`
Expected: FAIL because `shared/batch.ts` and `createBatch` do not exist.

- [ ] **Step 3: Implement validation and creation**

`parseBatchRequest` validates the discriminant, entry array length, per-entry URL/title, tags via `cleanTags`, plan title (required, trimmed, 300 max) and color against `PLAN_COLORS`; it returns a fresh object. `decodeBatchPayload` does `Buffer.from(data, 'base64url').toString('utf8')`, rejects over 256_000 characters, parses JSON and passes it to `parseBatchRequest`.

`createBatch` builds links with `createItem` (so rules and tags apply), then rebuilds the item array as `[plan?, ...links in entry order, ...state.items]`, because repeated `createItem` calls prepend and would reverse tab order. For `kind: 'plan'`, create the plan with `title`, `summary: ''`, `steps: []`, `color`, then create each link with `planId` set to the new plan id. Skip entries whose normalized URL is empty or not `isSafeExternalUrl`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/batch.test.ts tests/shared/batchCreate.test.ts && npm run typecheck`
Expected: tests PASS; both TypeScript projects PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/core.ts shared/batch.ts tests/shared/batch.test.ts tests/shared/batchCreate.test.ts
git commit -m "feat: add atomic batch capture model"
```

### Task 2: Save-selection capture end to end

**Files:**
- Create: `shared/capture.ts`
- Modify: `browser-extension/captureUrl.js`, `browser-extension/service-worker.js`, `electron/deepLink.ts`, `src/app-context.tsx`
- Test: `tests/shared/capture.test.ts` (create), `tests/electron/deepLink.test.ts` (modify), `tests/browser-extension/captureUrl.test.ts` (modify)

**Interfaces:**
- Consumes: `CapturePayload` from Task 1.
- Produces: `selectionQuote(text: string, max?: number): string` with `MAX_SELECTION_LENGTH = 2000`; `createCaptureUrl(url, title, selection?)`; `parseCaptureProtocol` returns `selection?: string` (trimmed, max 2000); the capture dialog receives `preset.notes` set to the quoted selection.

- [ ] **Step 1: Write the failing tests**

```ts
it('formatsSelectionAsBlockquoteWithEveryLineQuoted', () => {
  expect(selectionQuote('  First line\r\nsecond  \n\nthird')).toBe('> First line\n> second\n>\n> third');
  expect(selectionQuote('abcdef', 4)).toBe('> abcd');
  expect(selectionQuote('   ')).toBe('');
});
it('parsesSelectionFromProtocolRequests', () => {
  expect(parseCaptureProtocol('urlflow://add?url=https%3A%2F%2Fexample.com&selection=%20High%20light%20%20'))
    .toEqual({ url: 'https://example.com/', mode: 'dialog', selection: 'High light' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/capture.test.ts tests/electron/deepLink.test.ts tests/browser-extension/captureUrl.test.ts`
Expected: FAIL because `selectionQuote` does not exist and `selection` is dropped.

- [ ] **Step 3: Implement selection capture**

Add `selectionQuote` (normalize CRLF, trim, `slice(0, max)`, prefix every split line with `> `, empty line becomes `>`). In `parseCaptureProtocol`, read `selection`, reject malformed escapes through the existing `decodeURIComponent(request.search)` check, trim and slice to 2000, and include only when non-empty. In `createCaptureUrl`, set `selection` only when `selection?.trim()` is non-empty. Register `SELECTION_MENU` in `service-worker.js` with `contexts: ['selection']`, title `Save selection to URL Flow`, and open `createCaptureUrl(tab.url, tab.title, info.selectionText)`. In `app-context.tsx`, extend the `onCapture` dialog branch with `notes: selection ? selectionQuote(selection) : undefined`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/capture.test.ts tests/electron/deepLink.test.ts tests/browser-extension/captureUrl.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/capture.ts browser-extension/captureUrl.js browser-extension/service-worker.js electron/deepLink.ts src/app-context.tsx tests/shared/capture.test.ts tests/electron/deepLink.test.ts tests/browser-extension/captureUrl.test.ts
git commit -m "feat: capture highlighted selections as quoted notes"
```

### Task 3: Chunked protocol, Electron assembly and batch ingestion

**Files:**
- Modify: `electron/deepLink.ts`, `electron/main.ts`, `electron/preload.ts`, `electron/captureQueue.ts` (type import only), `src/app-context.tsx`, `src/lib/browserApi.ts`
- Create: `electron/captureBatches.ts`
- Test: `tests/electron/batchAssembler.test.ts` (create), `tests/electron/deepLink.test.ts` (modify)

**Interfaces:**
- Consumes: `parseBatchRequest`, `decodeBatchPayload`, `createBatch` (Task 1); `CapturePayload` batch fields (Task 1).
- Produces:
  - `interface BatchChunk { batchId: string; index: number; total: number; data: string }` and `parseBatchChunk(raw: string): BatchChunk | null`.
  - `class CaptureBatchAssembler { add(chunk: BatchChunk, now?: Date): { batchId: string; batch: BatchCaptureRequest } | null }` with a 60 000 ms TTL, at most 60 chunks, and duplicate-index tolerance.
  - `claimBatch(applied: Map<string, number>, batchId: string | undefined, now: number, windowMs?: number): boolean` - records a new id and returns true; returns false for an id already recorded inside the window; always true when `batchId` is empty.
  - `FlowApi.createBatch` implementation on `capture:batch` with label `Captured N tabs` / `Created a plan from N tabs`, one `commit` per batch.

- [ ] **Step 1: Write the failing tests**

```ts
it('assemblesOutOfOrderChunksOnceAndIgnoresDuplicates', () => {
  const batch = { kind: 'links' as const, entries: [{ url: 'https://example.com/a' }] };
  const payload = Buffer.from(JSON.stringify(batch), 'utf8').toString('base64url');
  const chunks = [payload.slice(0, 5), payload.slice(5)];
  const assembler = new CaptureBatchAssembler();
  expect(assembler.add(chunk(1, 2, chunks[1]))).toBeNull();
  expect(assembler.add(chunk(1, 2, chunks[1]))).toBeNull();
  expect(assembler.add(chunk(0, 2, chunks[0]))?.batch.entries).toHaveLength(1);
  expect(assembler.add(chunk(0, 2, chunks[0]))).toBeNull();
});
it('parsesOnlyWellFormedChunkRequests', () => {
  expect(parseBatchChunk('urlflow://add?batchId=abcdefgh&i=0&n=1&d=eyJ9')).toEqual({ batchId: 'abcdefgh', index: 0, total: 1, data: 'eyJ9' });
  for (const raw of ['urlflow://add?batchId=short&i=0&n=1&d=x', 'urlflow://add?batchId=abcdefgh&i=2&n=2&d=x', 'urlflow://add?batchId=abcdefgh&i=0&n=1&d=a+b']) {
    expect(parseBatchChunk(raw), raw).toBeNull();
  }
});
it('doesNotApplyTheSameBatchTwiceInsideTheWindow', () => {
  const applied = new Map<string, number>();
  expect(claimBatch(applied, 'batch-1', 1000)).toBe(true);
  expect(claimBatch(applied, 'batch-1', 2000)).toBe(false);
  expect(claimBatch(applied, 'batch-1', 1000 + 600_001)).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/electron/batchAssembler.test.ts tests/electron/deepLink.test.ts`
Expected: FAIL because the module and parser do not exist.

- [ ] **Step 3: Implement the transport**

`parseBatchChunk` mirrors `parseCaptureProtocol` route checks (`urlflow:`, host `add`, empty path, no credentials/port), then validates `batchId` (`/^[A-Za-z0-9_-]{8,64}$/`), integer `i`/`n` with `0 <= i < n <= 60`, and base64url data of 1-2000 characters. `CaptureBatchAssembler` stores per-batch chunk maps with `updatedAt`, purges entries older than 60 seconds or over 60 chunks on each `add`, and on completion calls `decodeBatchPayload`, clearing the entry even when decoding fails.

In `main.ts`, keep a module-level `CaptureBatchAssembler` and `Map<string, number>` for applied batches. `captureProtocol` tries `parseCaptureProtocol` first, then `parseBatchChunk`; enqueue only assembled batches as `{ url: null, mode: 'batch', batch: { ...assembled.batch, batchId: assembled.batchId } }`, and call `showWindow()` only when a payload is enqueued. Add `ipcMain.handle('capture:batch', ...)` that calls `claimBatch`, returns `{ state: store.get(), added: 0, skipped: 0, planId: null, duplicated: true }` without committing for repeats, otherwise runs `core.createBatch` and commits once with label `Captured N tabs` (or `Created a plan from N tabs`). Expose `createBatch` in `preload.ts` and `browserApi.ts` (compute `added`/`skipped`/`planId` from the core result and `mutate` only when something was created).

- [ ] **Step 4: Handle batches in the renderer**

In `app-context.tsx`'s `onCapture` handler, handle `batch` before the `url` check: call `api.createBatch(batch)`, `setState(result.state)`, then `showUndoToast` with `Saved N tabs` plus `, skipped M` when `result.skipped > 0`, or `Plan created with N links` and `navigate('plan', result.planId)` for plan batches. Toast `That browser batch could not be saved.` on error.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -- --run tests/electron/batchAssembler.test.ts tests/electron/deepLink.test.ts tests/electron/captureQueue.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/captureBatches.ts electron/deepLink.ts electron/main.ts electron/preload.ts src/app-context.tsx src/lib/browserApi.ts tests/electron/batchAssembler.test.ts tests/electron/deepLink.test.ts
git commit -m "feat: ingest chunked browser tab batches"
```

### Task 4: Extension popup for all tabs and tab groups

**Files:**
- Create: `browser-extension/tabs.js`, `browser-extension/popup.html`, `browser-extension/popup.js`
- Modify: `browser-extension/manifest.json`, `browser-extension/README.md`
- Test: `tests/browser-extension/tabs.test.ts` (create)

**Interfaces:**
- Consumes: chunk URL shape from Task 3.
- Produces (all exported from `tabs.js`):
  - `collectTabs(tabs: { url?: string; title?: string }[]): { url: string; title: string }[]` - keeps `http:`/`https:` only, preserves window order and duplicates, trims titles, caps 200.
  - `buildLinksBatch(entries, tags?: string[]): BatchCaptureRequest` and `buildPlanBatch(entries, { title, color?, tags? }): BatchCaptureRequest`.
  - `encodeBatch(batch): string` - UTF-8 JSON to base64url.
  - `createBatchCaptureUrls(batch, options?: { batchId?: string; maxLength?: number }): string[]` - 1200-character data slices, `urlflow://add?batchId=...&i=...&n=...&d=...`, each URL asserted `<= maxLength` (default 1800).
  - `buildTabGroupOptions(tabs, groups: { id: number; title?: string }[]): { id: number; title: string; entries: { url: string; title: string }[] }[]` - title falls back to `Tab group <id>`, entries keep tab order.

- [ ] **Step 1: Write the failing tests**

```ts
it('keepsOnlyWebTabsInWindowOrder', () => {
  expect(collectTabs([
    { url: 'https://a.example/1', title: ' One ' },
    { url: 'chrome://extensions', title: 'Extensions' },
    { url: 'https://a.example/1', title: 'One again' },
  ])).toEqual([{ url: 'https://a.example/1', title: 'One' }, { url: 'https://a.example/1', title: 'One again' }]);
});
it('splitsBatchesIntoProtocolSafeUrls', () => {
  const batch = buildLinksBatch(Array.from({ length: 40 }, (_, i) => ({ url: `https://example.com/${i}`, title: `Tab ${i}` })));
  const urls = createBatchCaptureUrls(batch, { batchId: 'abcdefgh', maxLength: 1800 });
  expect(urls.length).toBeGreaterThan(1);
  expect(urls.every((url) => url.length <= 1800 && url.startsWith('urlflow://add?batchId=abcdefgh&i='))).toBe(true);
});
it('groupsTabsAndFallsBackToAGeneratedTitle', () => {
  const options = buildTabGroupOptions(
    [{ url: 'https://a.example', title: 'A', groupId: 7 } as never],
    [{ id: 7, title: '' }],
  );
  expect(options).toEqual([{ id: 7, title: 'Tab group 7', entries: [{ url: 'https://a.example', title: 'A' }] }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/browser-extension/tabs.test.ts`
Expected: FAIL because `tabs.js` does not exist.

- [ ] **Step 3: Implement the popup**

`popup.html` renders: a tab count line, a tags input labelled `Tags`, a `Save all tabs as links` button, a group select labelled `Tab group`, a plan title input labelled `Plan title`, and `Save tabs as a plan`. `popup.js` runs `chrome.tabs.query({ currentWindow: true })` and `chrome.tabGroups.query({ windowId: tab.windowId })`, fills the count and groups, disables actions when no web tabs exist, builds the matching request, and opens every URL from `createBatchCaptureUrls` with `chrome.tabs.create({ url })` before closing the popup with a status message. Group plan title defaults to the group title; custom text wins.

Update `manifest.json`: version `1.1.0`, `permissions: ["contextMenus", "activeTab", "tabs", "tabGroups"]`, `action: { default_popup: "popup.html", default_title: "URL Flow Capture" }`. Update `README.md` with the selection menu, popup, tab-group support, the expanded permission list, and the fact that saving a batch opens one helper tab per chunk.

- [ ] **Step 4: Run the extension tests and typecheck**

Run: `npm test -- --run tests/browser-extension && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add browser-extension/tabs.js browser-extension/popup.html browser-extension/popup.js browser-extension/manifest.json browser-extension/README.md tests/browser-extension/tabs.test.ts
git commit -m "feat: add extension popup for tab and tab-group capture"
```

### Task 5: Phase verification and manual extension checklist

**Files:**
- No source changes expected

**Interfaces:**
- Consumes: everything above.
- Produces: a verified phase for the Phase 3 implementer.

- [ ] **Step 1: Run the full automated check**

Run: `npm test -- --run && npm run typecheck && npm run build`
Expected: all suites PASS, both TypeScript projects PASS, `dist/` and `dist-electron/` build cleanly.

- [ ] **Step 2: Record the manual extension check**

In the PR/commit notes, record these steps as performed or explicitly not performed: load `browser-extension/` unpacked with the new manifest; select text and use `Save selection to URL Flow`; confirm the dialog notes start with `> `; open 3 tabs, use the popup's `Save all tabs as links`, confirm one Undo restores the previous list; create a tab group, save it as a plan, confirm the plan exists with links in tab order.

- [ ] **Step 3: Commit only if the check required fixes**

If Step 1 or the manual checklist exposed a defect, fix it, rerun the failing command, and commit the files you touched with a message naming the defect. Otherwise leave the branch as is; do not create an empty commit.
