# Plan Templates, Focus Mode and Wiki-Links Implementation Plan (v1.2.0 Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn saved plans into reusable templates, add a focused execution view with launch-all-links, and connect notes and plans with clickable, bidirectional `[[wiki-links]]`.

**Architecture:** `planTemplates` join the version 2 state and are produced/consumed by a pure `shared/templates.ts` (relative day offsets, dates derived from a chosen end date). `PlanItem` gains `pinned` and `scratchpad`. Launching links reuses `openLinks`. Wiki tokens are parsed by a pure `shared/wikiLinks.ts` and rendered by small React components shared by cards and the plan detail view.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-15-url-flow-v1.2.0-feature-suite.md` - section 4.

## Global Constraints

- `planTemplates` live in `url-flow-data.json` and hold only text, ids and numbers (no HTML, no snapshots).
- Template limits: 200 steps, 200 tasks, 200 link ids, `dayOffset` integer 0-3650, name/summary/steps use the existing 300/600/300 character caps.
- Every plan/template/link change goes through `Store.commit`; toggling Focus Mode is view state only and never creates history.
- `PlanTemplate` offsets are days before the template's reference end date. A plan without a target date uses the step/task index as its offset.
- Scratchpad is capped at 20 000 characters and saved on blur (one undo entry per blur, only when the text changed).
- Launch All Links opens non-archived `http:`/`https:` links only, asks for confirmation above 8 links, and marks opened links read in a single commit.
- Tray entries exist only for pinned plans (`PlanItem.pinned === true`), at most 5.
- Wiki ids are `/^[A-Za-z0-9_-]{1,64}$/`; unresolved tokens render their label as plain text and never navigate.
- ASCII-only copy; reuse `Button`, `IconButton`, `Modal`, `Confirm`, `TagPill`, `run`, `showUndoToast`.

## Review Focus

- A template saved from a plan with no target date must still instantiate steps and tasks in order with valid due dates - test in Task 2.
- Instantiating a template whose reference links were deleted or archived must skip those links, not attach them to a missing plan - test in Task 2.
- A start/end date pair where the end precedes the start must be rejected with a message and create no plan - test in Task 2.
- Launch All Links on a plan with more than 8 links must confirm first and open nothing when cancelled - test in Task 5.
- `[[missing-id]]` in a note must render as a non-clickable label and must never navigate - test in Task 7.

---

## File Map

- `shared/types.ts` owns `PlanItem.pinned`, `PlanItem.scratchpad`, `PlanTemplate*`, `PlanTemplateOptions`, and the new `FlowApi` methods.
- `shared/core.ts` normalizes the new plan fields and template config.
- `shared/templates.ts` (new) owns template creation, upsert, instantiation and normalization.
- `shared/planLaunch.ts` (new) owns `planLinksForLaunch`.
- `shared/wikiLinks.ts` (new) owns token parsing, autocomplete queries, insertion and backlinks.
- `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts` expose template, launch and tray behavior.
- `src/views/Plans.tsx`, `src/views/PlanDetail.tsx`, `src/components/items.tsx`, `src/components/ItemDialog.tsx`, `src/components/TemplateDialog.tsx` (new), `src/components/WikiText.tsx` (new), `src/components/WikiLinkEditor.tsx` (new), `src/components/Backlinks.tsx` (new), `src/styles.css`.
- Tests: `tests/shared/planTemplates.test.ts`, `tests/shared/planLaunch.test.ts`, `tests/shared/wikiLinks.test.ts`, `tests/components/planTemplates.test.tsx`, `tests/components/planFocus.test.tsx`, `tests/components/launchLinks.test.tsx`, `tests/components/wikiLinks.test.tsx`.

### Task 1: Plan execution fields and template config

**Files:**
- Modify: `shared/types.ts`, `shared/core.ts`
- Test: `tests/shared/planTemplates.test.ts` (create, first cases only)

**Interfaces:**
- Consumes: version 2 state and `normalizeState` from Phase 1.
- Produces: `PlanItem.pinned: boolean` and `PlanItem.scratchpad: string`; `PlanTemplateOptions { title: string; startDate: string; endDate: string }` (the `PlanTemplate`, `PlanTemplateStep` and `PlanTemplateTask` types already exist from Phase 1 Task 1); `ItemDraft.pinned` for plans; `ItemPatch` accepts `pinned`/`scratchpad`. `planTemplates` stays `[]` in `emptyState` until Task 2 wires validation.

- [ ] **Step 1: Write the failing normalization test**

```ts
it('defaultsPinnedAndScratchpadOnLegacyPlans', () => {
  const state = normalizeState({ version: 2, items: [{ id: 'p1', kind: 'plan', title: 'Plan', notes: '', tags: [], planId: null, archivedAt: null, reviewedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', summary: '', status: 'active', targetDate: null, steps: [], color: PLAN_COLORS[0] }], reminders: [], ignoredMatches: [] });
  expect(state.items[0]).toMatchObject({ pinned: false, scratchpad: '' });
  expect(state.planTemplates).toEqual([]);
});
it('clampsScratchpadAndKeepsPinnedThroughUpdates', () => {
  const state = normalizeState({ version: 2, items: [{ id: 'p1', kind: 'plan', title: 'Plan', pinned: true, scratchpad: 'x'.repeat(30_000), /* remaining plan fields */ }], reminders: [], ignoredMatches: [] });
  const plan = state.items[0];
  expect(plan.kind === 'plan' && plan.scratchpad).toHaveLength(20_000);
  expect(plan.kind === 'plan' && plan.pinned).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/shared/planTemplates.test.ts`
Expected: FAIL because plan normalization lacks the fields.

- [ ] **Step 3: Add the model**

Add the interfaces and fields, set `pinned: Boolean(draft.pinned)`, `scratchpad: ''` for new plans, and normalize both fields for stored/imported plans (`scratchpad` sliced to 20 000). In `updateItem`'s plan branch, accept `pinned` (boolean) and `scratchpad` (string sliced to 20 000). Add `planTemplates: []` to `emptyState` if Phase 1 did not already.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/planTemplates.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/core.ts tests/shared/planTemplates.test.ts
git commit -m "feat: add plan pinning, scratchpad and template types"
```

### Task 2: Template creation and instantiation

**Files:**
- Create: `shared/templates.ts`
- Modify: `shared/core.ts` (wire `normalizePlanTemplates` into `normalizeState`)
- Test: `tests/shared/planTemplates.test.ts` (extend)

**Interfaces:**
- Consumes: `PlanItem`, `LinkItem`, `TaskItem`, `PlanTemplate`, `PlanTemplateOptions` from Task 1; `newId`, `nowIso`, `PLAN_COLORS`.
- Produces:
  - `templateFromPlan(plan: PlanItem, links: LinkItem[], tasks: TaskItem[], now?: Date): PlanTemplate`
  - `upsertPlanTemplate(state: AppState, template: PlanTemplate): AppState` - replaces a template with the same name case-insensitively, otherwise prepends.
  - `instantiateTemplate(template: PlanTemplate, options: PlanTemplateOptions, state: AppState, now?: Date): { state: AppState; planId: string }`
  - `normalizePlanTemplates(raw: unknown): PlanTemplate[]`

- [ ] **Step 1: Write the failing tests**

Start the file with local factories `plan(overrides)`, `link(overrides)`, `task(overrides)` and `template(overrides)` that spread a minimal valid record, as the existing shared test files do.

```ts
it('usesDayOffsetsBeforeTheTargetDate', () => {
  const template = templateFromPlan(plan({ targetDate: '2026-12-10T12:00:00.000Z', steps: [{ id: 's1', text: 'A', done: false, dueAt: '2026-12-01T12:00:00.000Z' }] }), [], [], new Date('2026-11-15T00:00:00.000Z'));
  expect(template.steps[0].dayOffset).toBe(9);
});
it('fallsBackToStepIndexWithoutATargetDate', () => {
  const template = templateFromPlan(plan({ targetDate: null, steps: [{ id: 's1', text: 'A', done: false }, { id: 's2', text: 'B', done: false }] }), [], []);
  expect(template.steps.map((step) => step.dayOffset)).toEqual([0, 1]);
});
it('instantiatesDueDatesFromTheChosenEndDate', () => {
  const template = { id: 't1', name: 'Launch', summary: '', color: PLAN_COLORS[0], steps: [{ text: 'Prep', notes: '', dayOffset: 2 }], tasks: [{ title: 'Ship', notes: '', priority: 'normal', dayOffset: 0 }], linkIds: ['l1'], createdAt: '', updatedAt: '' };
  const state = { ...emptyState(), items: [link({ id: 'l1' })] };
  const result = instantiateTemplate(template, { title: 'Fresh', startDate: '2026-11-15', endDate: '2026-11-20' }, state);
  const createdPlan = result.state.items.find((item) => item.id === result.planId);
  expect(createdPlan?.kind === 'plan' && createdPlan.steps[0].dueAt).toBe(new Date('2026-11-18T09:00:00').toISOString());
  expect(result.state.items.find((item) => item.id === 'l1')).toMatchObject({ planId: result.planId });
});
it('rejectsAnEndDateBeforeTheStartDate', () => {
  expect(() => instantiateTemplate(template(), { title: 'X', startDate: '2026-11-20', endDate: '2026-11-15' }, emptyState()))
    .toThrow('The end date must be on or after the start date.');
});
it('skipsLinksThatNoLongerExist', () => {
  const result = instantiateTemplate(template({ linkIds: ['gone', 'l1'] }), { title: 'X', startDate: '2026-11-15', endDate: '2026-11-16' }, { ...emptyState(), items: [link({ id: 'l1' })] });
  expect(result.state.items.filter((item) => item.kind === 'link').map((item) => item.id)).toEqual(['l1']);
});
it('replacesATemplateWithTheSameNameCaseInsensitively', () => {
  const saved = upsertPlanTemplate({ ...emptyState(), planTemplates: [template({ id: 'old', name: 'Launch' })] }, template({ id: 'new', name: 'launch' }));
  expect(saved.planTemplates).toHaveLength(1);
  expect(saved.planTemplates[0].id).toBe('new');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/planTemplates.test.ts`
Expected: FAIL because `shared/templates.ts` does not exist.

- [ ] **Step 3: Implement the module**

Offsets: `targetStart = startOfDay(plan.targetDate)`, step day = `startOfDay(step.dueAt)`, `dayOffset = clamp(round((targetStart - stepDay) / 86_400_000), 0, 3650)`, else the array index. Tasks use `task.dueAt` with the same rule. `linkIds` are non-archived attached links in plan order, capped at 200. `name` is the plan title (or `Untitled template`).

Instantiation: require `title.trim()` (300 max), `startDate`/`endDate` matching `/^\d{4}-\d{2}-\d{2}$/`, and `startDate <= endDate` (string compare is valid for this format), else throw `Choose a title, a start date and an end date.` or the end-date message. Anchor = `new Date(`${endDate}T09:00:00`)`; each step/task due = anchor minus `dayOffset` days. `targetDate` = `new Date(`${endDate}T12:00:00`).toISOString()` (matches `fromDateInput`). Return items as `[plan, ...tasks, ...state.items]` with attached links re-pointed to the new plan; never resurrect a deleted link.

`normalizePlanTemplates` validates every field, drops malformed entries, dedupes ids and clamps offsets.

- [ ] **Step 4: Run the tests, the full state suite and typecheck**

Run: `npm test -- --run tests/shared/planTemplates.test.ts tests/shared/migration.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/templates.ts shared/core.ts tests/shared/planTemplates.test.ts
git commit -m "feat: add plan templates with relative day offsets"
```

### Task 3: Template IPC, Plans entry point and save-as-template

**Files:**
- Modify: `shared/types.ts` (`FlowApi`), `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts`, `src/views/Plans.tsx`, `src/views/PlanDetail.tsx`, `src/components/items.tsx`, `src/components/ItemDialog.tsx`, `src/components/CommandPalette.tsx`, `src/app-context.tsx`, `src/App.tsx`
- Create: `src/components/TemplateDialog.tsx`
- Test: `tests/components/planTemplates.test.tsx` (create)

**Interfaces:**
- Consumes: `templateFromPlan`, `upsertPlanTemplate`, `instantiateTemplate` (Task 2).
- Produces: `FlowApi.savePlanTemplate(planId: string): Promise<AppState>`, `deletePlanTemplate(templateId: string): Promise<AppState>`, `createPlanFromTemplate(templateId: string, options: PlanTemplateOptions): Promise<{ state: AppState; planId: string }>`; `TemplateDialog({ onClose }: { onClose: () => void })`; context fields `templateDialogOpen: boolean`, `openTemplateDialog(): void`, `closeTemplateDialog(): void`; plan pin toggles in `PlanCard` and `ItemDialog`.

- [ ] **Step 1: Write the failing component test**

Mock `useApp` with `plans`, `links`, `tasks`, `state.planTemplates` containing one template `Launch`, `openTemplateDialog: vi.fn()`, and `api.createPlanFromTemplate` resolving `{ state, planId: 'p9' }`. First render `PlansView`, click `New from template`, and assert `openTemplateDialog` was called. Then render `<TemplateDialog onClose={vi.fn()} />`, select `Launch`, fill `Plan title` with `Q1 launch`, dates `2026-11-15`/`2026-11-30`, click `Create plan`, and assert the API received `('t1', { title: 'Q1 launch', startDate: '2026-11-15', endDate: '2026-11-30' })` and that `navigate` was called with `('plan', 'p9')`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/components/planTemplates.test.tsx`
Expected: FAIL because the entry point and dialog do not exist.

- [ ] **Step 3: Add IPC and browser-preview parity**

`planTemplate:save` finds the plan, builds `templateFromPlan(plan, links, tasks)` and commits `upsertPlanTemplate(...)` labelled `Saved a plan template`. `planTemplate:delete` commits the filtered list. `planTemplate:create` commits `instantiateTemplate(...)` labelled `Created a plan from a template` and returns `{ state, planId }`. Mirror all three in `preload.ts` and `browserApi.ts` using the shared functions.

- [ ] **Step 4: Build the UI**

`PlansView`: a `New from template` button (icon `LayoutTemplate`) shown when `state.planTemplates.length > 0`, calling `openTemplateDialog()`. Add the three template-dialog fields to `AppContextValue` and render `{templateDialogOpen ? <TemplateDialog onClose={closeTemplateDialog} /> : null}` once in `App.tsx` Next to the other dialogs, so there is exactly one owner. `TemplateDialog` renders the template list with name and step/task/link counts, a delete button per row, and a creation form: select, `Plan title` (defaults to template name), `Start date` (today), `End date` (today + 7 days), `Create plan`. Validation messages come from the thrown errors via `run`. On success `navigate('plan', planId)` and close.

`PlanDetail`: `Save as template` button in the hero actions calling `run(api.savePlanTemplate(plan.id), { success: 'Plan saved as template' })`. `PlanCard` and `ItemDialog`: a `Pin` toggle (`aria-label` `Pin plan to tray menu`) calling `api.update(plan.id, { pinned: !plan.pinned })`.

`CommandPalette`: add a `Create` group entry `New plan from template` (icon `LayoutTemplate`) listed only when `state.planTemplates.length > 0`; choosing it calls `navigate('plans')` then `openTemplateDialog()`, so it opens the same single dialog as the Plans button.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -- --run tests/components/planTemplates.test.tsx tests/components/richLinks.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts electron/main.ts electron/preload.ts src/lib/browserApi.ts src/views/Plans.tsx src/views/PlanDetail.tsx src/components/items.tsx src/components/ItemDialog.tsx src/components/TemplateDialog.tsx src/components/CommandPalette.tsx src/app-context.tsx src/App.tsx tests/components/planTemplates.test.tsx
git commit -m "feat: create plans from templates and manage them in the UI"
```

### Task 4: Focus mode and scratchpad

**Files:**
- Modify: `src/views/PlanDetail.tsx`, `src/styles.css`
- Test: `tests/components/planFocus.test.tsx` (create)

**Interfaces:**
- Consumes: `PlanItem.scratchpad` (Task 1), `api.update` (existing).
- Produces: `Focus mode`/`Exit focus mode` toggle, `detail-grid--focus` styling, `Scratchpad` panel; no new context or IPC.

- [ ] **Step 1: Write the failing component test**

Render `PlanDetail` with `view.id = 'p1'` and a plan with `scratchpad: 'old'`. Click `Focus mode`, assert the container has class `detail-grid--focus` and a `Scratchpad` heading appears. Type `new text` into `aria-label="Plan scratchpad"`, blur, and assert `api.update` was called once with `('p1', { scratchpad: 'new text' })`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/components/planFocus.test.tsx`
Expected: FAIL because the toggle and panel do not exist.

- [ ] **Step 3: Implement focus mode**

Add `const [focus, setFocus] = useState(false)` and a toolbar/hero button toggling it (`Maximize2`/`Minimize2`, label `Focus mode`/`Exit focus mode`). Apply `detail-grid--focus` to the existing grid; in focus mode hide the left `Attached notes` panel and the right `Reminder` panel, keeping summary/progress/steps/tasks on the left and `Links` plus the new `Scratchpad` panel on the right. Scratchpad uses local state seeded from `plan.scratchpad`, `maxLength={20_000}`, and an `onBlur` that calls `run(api.update(plan.id, { scratchpad: value }), { success: 'Scratchpad saved' })` only when the value differs from `plan.scratchpad`. Add CSS using existing panel tokens; focus mode stays responsive down to the 1040 px minimum window width.

- [ ] **Step 4: Run the test and typecheck**

Run: `npm test -- --run tests/components/planFocus.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/PlanDetail.tsx src/styles.css tests/components/planFocus.test.tsx
git commit -m "feat: add plan focus mode with scratchpad"
```

### Task 5: Launch All Links, plan cards and tray menu

**Files:**
- Create: `shared/planLaunch.ts`
- Modify: `shared/types.ts` (`FlowApi.launchPlanLinks`), `electron/main.ts`, `electron/preload.ts`, `src/lib/browserApi.ts`, `src/views/PlanDetail.tsx`, `src/components/items.tsx`
- Test: `tests/shared/planLaunch.test.ts` (create), `tests/components/launchLinks.test.tsx` (create)

**Interfaces:**
- Consumes: `openLinks` (`electron/openLinks.ts`), `PlanItem.pinned` (Task 1).
- Produces: `planLinksForLaunch(state: AppState, planId: string): LinkItem[]` (non-archived, `http:`/`https:`, plan order by `createdAt`); `FlowApi.launchPlanLinks(planId: string): Promise<AppState | null>`; a tray submenu `Pinned plans` with up to 5 `Launch all links · <title>` items.

- [ ] **Step 1: Write the failing tests**

```ts
it('excludesArchivedAndUnsafeLinks', () => {
  const state = { ...emptyState(), items: [link({ id: 'a', planId: 'p1' }), link({ id: 'b', planId: 'p1', archivedAt: '2026-01-01T00:00:00.000Z' }), link({ id: 'c', planId: 'p1', url: 'ftp://example.com/x' }), link({ id: 'd', planId: null })] };
  expect(planLinksForLaunch(state, 'p1').map((entry) => entry.id)).toEqual(['a']);
});
```
Component test: plan detail with 9 attached links; click `Launch all links`; expect no `api.launchPlanLinks` call and a confirm dialog mentioning `9`; click `Cancel` and assert still no call; reopen and confirm to assert one call with the plan id.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/planLaunch.test.ts tests/components/launchLinks.test.tsx`
Expected: FAIL because the helper and button do not exist.

- [ ] **Step 3: Implement the launch path**

`planLinksForLaunch` filters by `planId`, `!archivedAt`, and `isSafeExternalUrl`, sorted by `createdAt`.

Main `plan:launch`: read `planLinksForLaunch`, return `null` when empty, open each with `openLinks(links, (url) => shell.openExternal(url))`, and commit `readingState: 'read'` plus `lastOpenedAt` for the opened set (same shape as `link:openMany`). Add a `launchPlanById(planId, confirm)` helper used by IPC and the tray; when `confirm` and there are more than 8 links, `dialog.showMessageBoxSync` with buttons `['Launch', 'Cancel']`, `defaultId: 1`, `cancelId: 1`, and abort unless the result is `0`.

Tray: rebuild `Pinned plans` on `refreshTrayMenu` from `store.get().items.filter(item => item.kind === 'plan' && item.pinned && !item.archivedAt).slice(0, 5)` and call `launchPlanById(id, true)`. Also refresh the tray menu after pin/unpin commits.

Renderer: `browserApi.launchPlanLinks` mirrors with `window.open` and the same read marking. `PlanDetail` shows a `Launch all links` button with the count, using `Confirm` above 8; `PlanCard` shows a compact `Open all` icon button with the same confirmation rule.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/planLaunch.test.ts tests/components/launchLinks.test.tsx tests/electron/openLinks.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/planLaunch.ts shared/types.ts electron/main.ts electron/preload.ts src/lib/browserApi.ts src/views/PlanDetail.tsx src/components/items.tsx tests/shared/planLaunch.test.ts tests/components/launchLinks.test.tsx
git commit -m "feat: launch all plan links from the plan and tray"
```

### Task 6: Wiki-link parsing, autocomplete queries and backlinks

**Files:**
- Create: `shared/wikiLinks.ts`
- Test: `tests/shared/wikiLinks.test.ts` (create)

**Interfaces:**
- Consumes: `AnyItem`, `ItemKind`; `tokenize` from `shared/matching.ts`.
- Produces:
  - `type WikiSegment = { type: 'text'; text: string } | { type: 'link'; id: string; label: string; resolved: boolean }`
  - `interface BacklinkRef { id: string; kind: ItemKind; title: string }`
  - `tokenizeWikiLinks(text: string, items: AnyItem[]): WikiSegment[]`
  - `wikiLinkMarkup(item: AnyItem): string` - `[[<id>|<title>]]` with `|`, `[` and `]` stripped from the title.
  - `searchWikiTargets(query: string, items: AnyItem[], limit?: number): AnyItem[]` - active items only, prefix matches first.
  - `wikiQueryAt(text: string, caret: number): { start: number; query: string } | null`
  - `insertWikiLink(text: string, caret: number, item: AnyItem): { text: string; caret: number }`
  - `backlinksFor(itemId: string, items: AnyItem[]): BacklinkRef[]`

- [ ] **Step 1: Write the failing tests**

```ts
it('parsesResolvedAndUnresolvedTokens', () => {
  const items = [note({ id: 'n1', title: 'Doc' })];
  expect(tokenizeWikiLinks('See [[n1|The doc]] and [[missing]].', items)).toEqual([
    { type: 'text', text: 'See ' },
    { type: 'link', id: 'n1', label: 'The doc', resolved: true },
    { type: 'text', text: ' and ' },
    { type: 'link', id: 'missing', label: 'missing', resolved: false },
    { type: 'text', text: '.' },
  ]);
});
it('opensSuggestionsOnlyForAnUnclosedDoubleBracket', () => {
  expect(wikiQueryAt('See [[la', 8)).toEqual({ start: 4, query: 'la' });
  expect(wikiQueryAt('See [[n1|Done]]', 15)).toBeNull();
});
it('insertsATokenAtTheCaret', () => {
  expect(insertWikiLink('See [[la', 8, { id: 'n1', title: 'Launch plan' } as never))
    .toEqual({ text: 'See [[n1|Launch plan]] ', caret: 23 });
});
it('findsBacklinksInNotesAndPlanSummariesWithoutSelf', () => {
  const items = [
    note({ id: 'n1', title: 'Target', notes: '' }),
    note({ id: 'n2', title: 'Referrer', notes: 'About [[n1|Target]]' }),
    plan({ id: 'p1', title: 'Plan', summary: 'Uses [[n1]]', notes: '[[p1|self]]' }),
  ];
  expect(backlinksFor('n1', items).map((ref) => ref.id)).toEqual(['n2', 'p1']);
  expect(backlinksFor('p1', items)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run tests/shared/wikiLinks.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the module**

Token regex `/\[\[([A-Za-z0-9_-]{1,64})(?:\|([^\]\n]{1,200}))?\]\]/g`, matching only whole tokens; everything between matches becomes `text`. Resolve against `items` by id (archived items still resolve, so old references stay readable). `searchWikiTargets` scores `title.startsWith(query)` above `title.includes` above url/tag/summary matches, then sorts by title length, capped at `limit` (default 8). `wikiQueryAt` looks backwards from the caret for `[[` with no `]]`, `|` or newline between them and returns the bracket start plus the typed query. `insertWikiLink` replaces from `start` through the caret with `wikiLinkMarkup(item) + ' '`. `backlinksFor` scans `item.notes` plus plan `summary` for tokens pointing at `itemId`, excluding the item itself, deduped by id and sorted by title.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/shared/wikiLinks.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/wikiLinks.ts tests/shared/wikiLinks.test.ts
git commit -m "feat: parse wiki links and backlinks"
```

### Task 7: Wiki-link editor, rendered chips and backlinks UI

**Files:**
- Create: `src/components/WikiText.tsx`, `src/components/WikiLinkEditor.tsx`, `src/components/Backlinks.tsx`
- Modify: `src/components/ItemDialog.tsx`, `src/components/items.tsx`, `src/views/PlanDetail.tsx`, `src/styles.css`
- Test: `tests/components/wikiLinks.test.tsx` (create)

**Interfaces:**
- Consumes: `tokenizeWikiLinks`, `searchWikiTargets`, `wikiQueryAt`, `insertWikiLink`, `backlinksFor` (Task 6).
- Produces: `WikiText({ text }: { text: string })`, `WikiLinkEditor({ value, onChange, ariaLabel, placeholder, rows })`, `Backlinks({ itemId }: { itemId: string })`; `ItemDialog` uses `WikiLinkEditor` for note/plan notes and the plan summary.

- [ ] **Step 1: Write the failing component test**

Mock `useApp` with `notes`, `plans`, `tasks`, `links` containing a plan `p1` titled `Launch`, `navigate`, `openEditor`, `search`. Render `<WikiText text="See [[p1|Launch]] and [[nope]]" />`; assert a button named `Launch` exists whose click calls `navigate('plan', 'p1')`, and that `nope` renders as text (no button). Render `<Backlinks itemId="p1" />` with one note containing `[[p1|Launch]]` and assert `Referenced by` plus the note title.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/components/wikiLinks.test.tsx`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the components**

`WikiText` maps segments to text nodes and `<button type="button" className="wiki-link">` for resolved ids; plans call `navigate('plan', id)`, links/tasks/notes call `openEditor({ kind, item })`, and missing items use `<span className="wiki-link wiki-link--missing" title="This item no longer exists">`. `Backlinks` renders nothing when empty; otherwise a `<section className="backlinks">` with `<h4>Referenced by</h4>` and one chip per referrer using the same navigation rules.

`WikiLinkEditor` is a textarea wrapper: on change it records `event.target.selectionStart`, calls `wikiQueryAt`, and renders an absolutely positioned list (`role="listbox"`, `aria-label="Wiki link suggestions"`) of `searchWikiTargets(query, allItems)`, hidden when the query is null. Choosing an entry calls `insertWikiLink` and `onChange` with the new text, then restores focus and caret. Escape closes the list. Use it in `ItemDialog` for the notes textarea and the plan summary (rows 2); leave the title inputs unchanged.

Replace plain rendering with `WikiText` for `NoteCard` body, `PlanDetail` summary and plan notes, and add `<Backlinks itemId={...} />` at the bottom of `NoteCard` and the plan detail page. Style with the existing accent/border tokens and keep chips keyboard-focusable.

- [ ] **Step 4: Run the tests and the full suite**

Run: `npm test -- --run tests/components/wikiLinks.test.tsx tests/components/richLinks.test.tsx && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WikiText.tsx src/components/WikiLinkEditor.tsx src/components/Backlinks.tsx src/components/ItemDialog.tsx src/components/items.tsx src/views/PlanDetail.tsx src/styles.css tests/components/wikiLinks.test.tsx
git commit -m "feat: render and edit wiki links with backlinks"
```
