# Bulk Link Triage Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Clean up imported links in batches with one selection toolbar and one undo step per bulk action.

**Architecture:** Add pure state transitions for tag, plan, archive, and match-ignore actions, then commit each transition once through the existing desktop store. Open selected links through one main-process API call that records successful opens together. Add selection controls to Links only.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Vitest.

**Spec:** docs/superpowers/specs/2026-10-30-url-flow-build-roadmap.md — section 4.

## Global Constraints

- The initial multi-select surface is Links; Tasks and Notes remain a later expansion.
- Tagging adds and deduplicates tags without replacing existing tags.
- A bulk action is one state commit and one undo step.
- Match-ignore applies to every pair in any duplicate group intersecting the selected links.
- Opening selected links marks successful links read and records their open time; validate each stored URL before calling shell.openExternal.
- Ignore stale or archived IDs in a selection safely; do not mutate non-link items.

## Review Focus

- A 200-link selection must archive all 200 in one state transition; test in bulkTriage.test.ts.
- Duplicate selected IDs must not apply the same mutation twice; test with repeated IDs.
- An invalid plan ID must not silently attach links to a nonexistent plan; test the assignment action.
- Ignoring one selected member of a duplicate group must suppress all pair suggestions in that group; test group pair generation.
- An external-open failure for one selected link must not prevent the other safe URLs from opening or corrupt the saved state; test the main-process open helper with one rejected opener.

---

## File Map

- shared/types.ts defines bulk action payloads; shared/core.ts applies pure batch mutations.
- electron/main.ts handles one undoable triage commit and batched external opens; electron/preload.ts and src/lib/browserApi.ts expose matching FlowApi methods.
- src/components/LinkBulkToolbar.tsx renders selected actions; src/views/Links.tsx owns selection and visible-list behavior; src/components/items.tsx renders selection checkboxes.
- tests/shared/bulkTriage.test.ts covers core actions; tests/electron/openLinks.test.ts covers partial external-open failures.

### Task 1: Implement pure batch link actions

**Files:**
- Modify: shared/types.ts, shared/core.ts
- Create: tests/shared/bulkTriage.test.ts

**Interfaces:**
- Produces: LinkBulkAction union with add-tags, assign-plan, archive, and ignore-matches variants.
- Produces: bulkTriageLinks(state: AppState, ids: string[], action: LinkBulkAction, now?: Date) -> AppState.
- For ignore-matches, action carries sorted pair keys already expanded from every intersecting duplicate group.

- [ ] Step 1: Add failing tests named addsTagsWithoutReplacingExistingAndDeduplicatesIds, assignsOrClearsPlanAndRejectsUnknown, ignoresEveryPairInGroup, and archivesTwoHundredLinks. Assert the 200-link result archives every item and changes only the requested links.
- [ ] Step 2: Run npm test -- --run tests/shared/bulkTriage.test.ts. Expected: FAIL because bulkTriageLinks does not exist.
- [ ] Step 3: Implement the action union and pure mutator. De-duplicate IDs and tags; reject an unknown non-null plan; preserve non-link records; use one timestamp for the archive batch.
- [ ] Step 4: Run npm test -- --run tests/shared/bulkTriage.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 5: Commit as feat: add bulk link triage operations.

### Task 2: Add one-commit desktop APIs

**Files:**
- Modify: shared/types.ts, electron/main.ts, electron/preload.ts, src/lib/browserApi.ts
- Create: electron/openLinks.ts, tests/electron/openLinks.test.ts

**Interfaces:**
- Produces: FlowApi.bulkTriage(ids: string[], action: LinkBulkAction) -> Promise<AppState>.
- Produces: FlowApi.openLinks(ids: string[]) -> Promise<AppState>.
- The open helper accepts links and an injected opener, returns successful item IDs, and continues after an individual open failure.

- [ ] Step 1: Add failing tests named opensSafeLinksAndContinuesAfterFailure and returnsOnlySuccessfullyOpenedIds. Assert unsafe URLs are skipped, a rejected opener does not stop later URLs, and only opened IDs are returned.
- [ ] Step 2: Run npm test -- --run tests/electron/openLinks.test.ts. Expected: FAIL because the batch-open helper does not exist.
- [ ] Step 3: Implement the testable open helper and main-process IPC. Validate links, open them with shell.openExternal, then update lastOpenedAt and readingState=read once for successful IDs and call commit once.
- [ ] Step 4: Wire bulkTriage to one core call and one commit. Add matching preload and browserApi methods; browser preview opens each safe URL and saves one combined state mutation.
- [ ] Step 5: Run the bulk and open-helper tests plus npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 6: Commit as feat: expose batch link actions.

### Task 3: Add Links multi-select and triage toolbar

**Files:**
- Create: src/components/LinkBulkToolbar.tsx
- Modify: src/views/Links.tsx, src/components/items.tsx, src/styles.css

**Interfaces:**
- Consumes: LinkBulkAction, FlowApi.bulkTriage, and FlowApi.openLinks from Tasks 1 and 2.
- Selection is a Set of link IDs owned by LinksView; toolbar actions apply to the full selection and clear it after a successful mutation.

- [ ] Step 1: Add a checkbox to each LinkCard that stops card-click propagation, exposes an accessible label, and reflects controlled selected state.
- [ ] Step 2: Add Select visible and Clear selection controls. Show the selected count and keep selection stable while search and filters change.
- [ ] Step 3: Add toolbar actions for adding tags, assigning or clearing a plan, archiving, opening, and ignoring intersecting duplicate groups. Disable ignore when no selected link belongs to a duplicate group.
- [ ] Step 4: Expand intersecting duplicate group IDs into all sorted matchKey pairs before calling bulkTriage. After a successful archive or triage action, clear selection and use the existing undo toast.
- [ ] Step 5: Run npm test -- --run tests/shared/bulkTriage.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 6: Commit as feat: add bulk triage to Links.
