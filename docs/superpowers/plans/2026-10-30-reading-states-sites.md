# Reading States and Sites View Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make link reading intent visible and filterable, with a host-based Sites view and stale review that focuses on unread or later links.

**Architecture:** Add a normalized readingState field to link records and retain backward compatibility by defaulting old records to unread. Build deterministic host groups from active links, expose status filters and controls in Links, and have opening a link mark it read.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Vitest.

**Spec:** docs/superpowers/specs/2026-10-30-url-flow-build-roadmap.md — section 3.

## Global Constraints

- The only reading states are unread, later, and read.
- Links without a valid stored state normalize to unread, including imported legacy backups.
- Opening a link marks it read; the review “keep” action preserves its current state.
- Sites groups use the normalized hostname returned by hostOf and include active links only.
- Existing favorite, unfiled, tag, search, sort, and archive behavior remains available.

## Review Focus

- A legacy backup link with no state must be unread after normalization; test in the migration task.
- A malformed readingState value must normalize to unread; test in the migration task.
- A repeated read-state update must not create a different state or duplicate link; test valid transitions.
- Hosts differing only by www must share one Site group; test in the grouping task.
- Stale read links must not appear in review while stale unread and later links do; test buildReviewQueue with a fixed date.

---

## File Map

- shared/types.ts and shared/core.ts own the reading-state contract, normalization, and merge behavior.
- shared/sites.ts groups active links by host for both deterministic tests and the UI.
- src/views/Links.tsx adds reading-state filters; src/components/items.tsx and ItemDialog.tsx expose state and mark cached identity consistently.
- src/views/Sites.tsx and navigation.ts, Sidebar.tsx, App.tsx, and TopBar.tsx add the Sites page.
- electron/main.ts, src/lib/browserApi.ts, and src/views/Review.tsx mark links read when opened and filter stale review.
- tests/shared/readingState.test.ts, tests/shared/sites.test.ts, and tests/shared/review.test.ts pin state, grouping, and review behavior.

### Task 1: Add and migrate the reading-state model

**Files:**
- Modify: shared/types.ts, shared/core.ts
- Create: tests/shared/readingState.test.ts

**Interfaces:**
- Produces: ReadingState = unread | later | read.
- LinkItem.readingState is required after normalization; ItemDraft.readingState is optional and defaults to unread.
- Produces: isReadingState(value: unknown) -> value is ReadingState.

- [ ] Step 1: Add failing tests named defaultsLegacyLinksToUnread, rejectsUnknownStateAsUnread, and mergeKeepsMostUnfinishedReadingState. Assert unread wins over later, later wins over read, and two read links merge to read.
- [ ] Step 2: Run npm test -- --run tests/shared/readingState.test.ts. Expected: FAIL because readingState is not part of the model.
- [ ] Step 3: Add the type guard; set unread for new link drafts without a valid state; validate patches; normalize legacy and imported backup links to unread. Merge the state using the priority tested above.
- [ ] Step 4: Run npm test -- --run tests/shared/readingState.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 5: Commit as feat: add link reading states.

### Task 2: Group sites and add Links state controls

**Files:**
- Create: shared/sites.ts, tests/shared/sites.test.ts
- Modify: src/views/Links.tsx, src/components/items.tsx, src/components/ItemDialog.tsx, src/styles.css

**Interfaces:**
- Produces: groupLinksByHost(links: LinkItem[]) -> SiteGroup[].
- SiteGroup has host, links, unreadCount, and laterCount. Groups sort by host; links preserve newest-first order.
- Consumes: ReadingState and normalized link records from Task 1.

- [ ] Step 1: Add failing tests named groupsWwwAndBareHostTogether and countsUnreadAndLater. Assert www.example.com and example.com group under example.com and read links do not contribute to unread/later counts.
- [ ] Step 2: Run npm test -- --run tests/shared/sites.test.ts. Expected: FAIL because groupLinksByHost does not exist.
- [ ] Step 3: Implement groupLinksByHost for active inputs; use hostOf and omit links with an empty host.
- [ ] Step 4: Add an independent Links reading-state filter with All, Unread, Later, and Read options. Preserve current favorites, unfiled, tag, search, and sort filters.
- [ ] Step 5: Add a compact reading-state control to the link card and ItemDialog. Update through api.update; preserve the current selection when editing title, notes, tags, or URL.
- [ ] Step 6: Run the site and reading-state tests plus npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 7: Commit as feat: filter links by reading state.

### Task 3: Add the Sites view

**Files:**
- Create: src/views/Sites.tsx
- Modify: src/lib/navigation.ts, src/components/Sidebar.tsx, src/components/TopBar.tsx, src/App.tsx, src/styles.css

**Interfaces:**
- Consumes: groupLinksByHost from Task 2.
- Produces: ViewName includes sites; each host group renders its link cards and unread/later counts.

- [ ] Step 1: Add a Sites navigation entry and VIEW_META title and subtitle; render SitesView from App.tsx.
- [ ] Step 2: Render one host section per SiteGroup with host name, link count, unread/later counts, and compact LinkCards. Keep links searchable using the existing global search.
- [ ] Step 3: Run npm run typecheck. Expected: both TypeScript projects PASS.
- [ ] Step 4: Commit as feat: add host-based Sites view.

### Task 4: Connect stale review to reading intent

**Files:**
- Modify: shared/review.ts, electron/main.ts, src/lib/browserApi.ts, src/views/Review.tsx
- Create: tests/shared/review.test.ts

**Interfaces:**
- Consumes: LinkItem.readingState from Task 1.
- Opening a link sets readingState to read in both desktop and browser-preview APIs.

- [ ] Step 1: Add a fixed-clock test named staleReviewIncludesUnreadAndLaterButNotRead. Assert only stale unread and later links generate stale-link review entries.
- [ ] Step 2: Run npm test -- --run tests/shared/review.test.ts. Expected: FAIL because review currently includes every stale link.
- [ ] Step 3: Filter buildReviewQueue stale-link entries to unread and later. Update desktop and browser openLink implementations to set readingState to read with lastOpenedAt in the same state update.
- [ ] Step 4: Keep Review’s “keep for another month” behavior unchanged; opening a stale link moves it to read through openLink.
- [ ] Step 5: Run the review test and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 6: Commit as feat: connect reading states to review.
