# Rich Link Enrichment Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Fetch useful page identity once, cache each favicon locally, and show the resulting preview before a user writes notes.

**Architecture:** Keep page requests and favicon disk access in Electron main. Add a typed FlowApi contract and persist descriptive metadata plus a hashed favicon key on each link; renderer components request icon data through the bridge and keep the existing initials fallback.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Vite 8, Vitest (new).

**Spec:** docs/superpowers/specs/2026-10-30-url-flow-build-roadmap.md — section 1.

## Global Constraints

- Keep network and filesystem access in Electron main behind the sandboxed preload FlowApi.
- Preserve existing HTTP and HTTPS URL validation and local-only workspace storage.
- Old links and backups without enrichment fields remain loadable.
- Metadata failure never prevents saving a link; the URL host and color initials remain fallbacks.
- Store favicon files under userData/favicons; persist only a 64-character lowercase hex cache key on link items.
- Normalize description to at most 500 characters, siteName to at most 120 characters, and accept faviconKey only when it matches 64 lowercase hexadecimal characters.
- Read at most 400,000 bytes of page HTML and cache at most 128,000 bytes per favicon. Accept PNG, JPEG, GIF, WebP, and ICO only.

## Review Focus

- A redirect to a non-HTTP(S) URL must be rejected; test redirected response validation in the fetcher task.
- An HTML or favicon response larger than its cap must not be fully retained or cached; test the size limits in the fetcher task.
- Reordered and entity-encoded meta attributes must still produce the right fields; test both parser cases in the parser task.
- A slower response for an old URL must not replace a newer dialog preview; test stale-request handling in the dialog task.
- A missing or corrupt local icon must show initials without breaking the card; test the fallback in the icon component task.

---

## File Map

- electron/pageMetadata.ts parses HTML, fetches page and icon responses, and reads/writes the bounded hashed icon cache.
- shared/types.ts defines metadata fields and renderer bridge methods; shared/core.ts creates, updates, and normalizes enriched links.
- electron/main.ts and electron/preload.ts expose the safe metadata/cache IPC calls; src/lib/browserApi.ts provides browser-preview fallbacks.
- src/components/Favicon.tsx renders a cached icon or initials; usePageMetadata.ts protects the preview from stale requests; ItemDialog.tsx previews metadata; items.tsx renders metadata on saved cards.
- vitest.config.ts and tests/electron/pageMetadata.test.ts establish the test runner; component tests exercise preview races and fallback.

### Task 1: Metadata parser and test runner

**Files:**
- Create: vitest.config.ts
- Create: tests/electron/pageMetadata.test.ts
- Create: electron/pageMetadata.ts
- Modify: package.json, package-lock.json, vitest.config.ts

**Interfaces:**
- Produces: parsePageMetadata(html: string, pageUrl: string) -> ParsedPageMetadata.
- ParsedPageMetadata has title, description, siteName, and faviconUrl fields, each string or null.

- [ ] Step 1: Add tests named parsesOpenGraphTitleDescriptionSiteNameAndRelativeIcon and fallsBackToHtmlTitleAndDescriptionMeta. Assert Open Graph values win, fallback tags fill missing values, reordered attributes and entity text parse, and a relative icon resolves against pageUrl.
- [ ] Step 2: Add Vitest configuration with jsdom and the package test script; add @testing-library/react and jsdom as dev dependencies.
- [ ] Step 3: Run npm test -- --run tests/electron/pageMetadata.test.ts. Expected: FAIL because parsePageMetadata is not implemented.
- [ ] Step 4: Implement parsePageMetadata in electron/pageMetadata.ts with the interface above.
- [ ] Step 5: Run npm test -- --run tests/electron/pageMetadata.test.ts. Expected: PASS for both parser cases.
- [ ] Step 6: Commit as feat: parse rich page metadata.

### Task 2: Bounded fetch and local favicon cache

**Files:**
- Modify: electron/pageMetadata.ts, shared/core.ts
- Modify: shared/types.ts, shared/core.ts
- Modify: electron/main.ts, electron/preload.ts, src/lib/browserApi.ts
- Create: tests/electron/pageMetadataFetch.test.ts, tests/shared/enrichedLinks.test.ts

**Interfaces:**
- Produces: LinkMetadata = { title: string | null; description: string | null; siteName: string | null; faviconKey: string | null }.
- Produces: FlowApi.fetchMetadata(url: string) -> Promise<LinkMetadata | null>.
- Produces: FlowApi.readFavicon(key: string) -> Promise<string | null>, returning a MIME-qualified data URL or null.
- LinkItem, ItemDraft, and ItemPatch gain optional description, siteName, and faviconKey fields. New drafts and normalized legacy links preserve those values when present.

- [ ] Step 1: Add fetch/cache tests named fetchesMetadataAndCachesAllowedIcon, fallsBackToOriginFavicon, rejectsUnsafeRedirects, ignoresUnsupportedIconMime, doesNotReadPastHtmlLimit, and doesNotCacheOversizedIcon. Mock fetch and use a temporary userData directory; assert the cache key is a 64-character lowercase hex string and readFavicon returns the original supported MIME. Add mergeKeepsEnrichmentWhenPrimaryLacksIt and assert description, siteName, and faviconKey fall back from the merged item.
- [ ] Step 2: Run npm test -- --run tests/electron/pageMetadataFetch.test.ts tests/shared/enrichedLinks.test.ts. Expected: FAIL because bounded fetch/cache and metadata-preserving merge behavior are not implemented.
- [ ] Step 3: Implement fetchPageMetadata(rawUrl, userDataPath) and readFaviconDataUrl(userDataPath, key). Validate the initial and final response URLs, stream each body only up to its limit and cancel oversized responses, use a 9-second timeout, and derive the cache key from the icon URL with SHA-256. If HTML has no icon link, try the origin's /favicon.ico.
- [ ] Step 4: Add the metadata types and FlowApi methods. Wire IPC in main/preload; make browserApi return null for network metadata and icons. Preserve absent metadata as absent when normalizing old state and enforce the field caps in Global Constraints. Reject a favicon cache key that is not 64 lowercase hexadecimal characters before constructing a path.
- [ ] Step 5: Preserve link enrichment in shared/core.ts merge behavior by taking each missing primary metadata field from the other link.
- [ ] Step 6: Run npm test -- --run tests/electron/pageMetadataFetch.test.ts tests/shared/enrichedLinks.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 7: Commit as feat: fetch and cache link metadata.

### Task 3: Dialog preview and enriched link cards

**Files:**
- Create: src/components/Favicon.tsx
- Create: src/components/usePageMetadata.ts
- Modify: src/components/ItemDialog.tsx, src/components/items.tsx, src/styles.css, src/app-context.tsx, src/views/Links.tsx
- Create: tests/components/Favicon.test.tsx, tests/components/usePageMetadata.test.tsx

**Interfaces:**
- Consumes: FlowApi.fetchMetadata, FlowApi.readFavicon, and the optional link metadata fields from Task 2.
- Produces: Favicon({ url, faviconKey, size? }) with initials fallback and a failed-image fallback.
- Produces: usePageMetadata(url, fetchMetadata) -> { metadata, fetching }, applying only results for the latest normalized URL.

- [ ] Step 1: Add a Favicon test named fallsBackWhenCachedIconCannotBeRead. Assert a missing cache result renders the URL initials and does not render a broken img element.
- [ ] Step 2: Run npm test -- --run tests/components/Favicon.test.tsx. Expected: FAIL because Favicon does not exist.
- [ ] Step 3: Add latestUrlWinsWhenMetadataResponsesResolveOutOfOrder using deferred promises. Assert that resolving the first request after rerendering with a second URL leaves only the second metadata visible.
- [ ] Step 4: Implement usePageMetadata with a 400 ms debounce and a request-generation guard; implement Favicon with a guarded asynchronous readFavicon call and cleanup on key changes.
- [ ] Step 5: In ItemDialog, fill title only while the user has not edited it, preview site name, description, and favicon before notes, and save fetched metadata with the link.
- [ ] Step 6: In LinkCard, show the cached favicon, site name, and a short metadata description while preserving notes, URL, and initials fallback. Update clipboard paste to use fetchMetadata once instead of fetching only a title.
- [ ] Step 7: Run npm test -- --run tests/components/Favicon.test.tsx tests/components/usePageMetadata.test.tsx and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 8: Commit as feat: show rich link previews.
