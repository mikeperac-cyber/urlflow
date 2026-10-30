# Zero-Friction Capture Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Send the current browser page to URL Flow’s capture dialog without copying its address.

**Architecture:** Register urlflow://add as an Electron deep link and make startup, second-instance, and macOS open-url events feed the existing capture bridge. Add a small Chrome/Edge Manifest V3 context-menu helper that passes the active page URL and title through that deep link.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Chrome/Edge Manifest V3, Vitest.

**Spec:** docs/superpowers/specs/2026-10-30-url-flow-build-roadmap.md — section 2.

## Global Constraints

- Accept only the urlflow://add route and a valid normalized HTTP or HTTPS URL.
- Keep the existing Ctrl+Shift+Space clipboard flow as a direct save.
- A protocol capture opens the normal save dialog; metadata enrichment from plan 1 fills a missing title.
- Keep the browser helper minimal: context-menu access to the current page or clicked link, with no page-reading content script or remote service.
- Package registration is for the existing Windows NSIS install; the browser helper is loaded once by the user as an unpacked Chrome/Edge extension.

## Review Focus

- Malformed query strings, unsupported scheme, or unsafe URL must be rejected without opening a dialog; test in deepLink.test.ts.
- A protocol URL received on first process launch must not be lost before the renderer subscribes; test the pending capture queue in the IPC task.
- A protocol capture must open a dialog rather than silently save; test the parsed payload mode.
- A context-menu click on a link must use the clicked URL and omit the active page title; test the browser helper.
- An absent title must still open the dialog and let plan 1 metadata fill it; test capture payload handling.

---

## File Map

- electron/deepLink.ts parses and validates protocol URLs.
- electron/main.ts registers the protocol, handles startup and second-instance delivery, and queues captures until the renderer listener is ready.
- shared/types.ts and electron/preload.ts type the dialog capture payload, per-request ID, and readiness acknowledgment; app-context.tsx routes dialog captures versus clipboard saves.
- browser-extension/manifest.json, service-worker.js, and captureUrl.js implement and test the one-click Chrome/Edge context-menu helper.
- package.json declares the protocol and includes extension source in desktop packaging; README.md documents one-time extension setup.
- ItemDialog.tsx resets new dialog state for a new capture request while using plan 1 metadata preview behavior.

### Task 1: Parse protocol capture requests

**Files:**
- Create: electron/deepLink.ts
- Create: tests/electron/deepLink.test.ts
- Modify: shared/types.ts

**Interfaces:**
- Produces: parseCaptureProtocol(raw: string) -> CapturePayload | null.
- CapturePayload adds optional title, mode, and requestId fields; mode is clipboard or dialog. Parsed protocol payloads use mode dialog; the main-process queue assigns a unique requestId to each queued capture.

- [ ] Step 1: Add failing tests named parsesUrlAndOptionalTitle, protocolCaptureUsesDialogMode, rejectsWrongRouteAndScheme, and rejectsUnsafeOrMissingUrl. Assert accepted URLs are normalized, optional titles are trimmed, and parsed requests use dialog mode without saving.
- [ ] Step 2: Run npm test -- --run tests/electron/deepLink.test.ts. Expected: FAIL because the parser does not exist.
- [ ] Step 3: Implement the parser using URL, normalizeUrl, and isSafeExternalUrl. Ignore unknown query parameters.
- [ ] Step 4: Run npm test -- --run tests/electron/deepLink.test.ts. Expected: all four tests PASS.
- [ ] Step 5: Commit as feat: parse URL Flow capture links.

### Task 2: Register and reliably deliver Electron deep links

**Files:**
- Modify: electron/main.ts, electron/preload.ts, shared/types.ts, package.json, src/app-context.tsx, src/components/ItemDialog.tsx
- Create: tests/electron/captureQueue.test.ts

**Interfaces:**
- Consumes: parseCaptureProtocol from Task 1.
- Produces: FlowApi.onCapture callback registration acknowledges readiness; main keeps incoming payloads until the renderer callback is subscribed.

- [ ] Step 1: Add failing queue tests named retainsInitialCaptureUntilRendererReady, deliversSecondInstanceCaptureOnce, and keepsMultipleCapturesInFifoOrder. Assert FIFO order, one delivery per payload, and a distinct requestId for each capture.
- [ ] Step 2: Run npm test -- --run tests/electron/captureQueue.test.ts. Expected: FAIL because the queue does not exist.
- [ ] Step 3: Add a small testable capture queue that assigns crypto.randomUUID() request IDs. Register urlflow as a default protocol in Electron and electron-builder configuration. Handle an initial Windows argv URL, second-instance argv, and macOS open-url; focus the window and enqueue valid captures.
- [ ] Step 4: Send a renderer-ready acknowledgment after preload registers onCapture, then flush queued payloads. Keep ordinary clipboard payloads in clipboard mode.
- [ ] Step 5: Add requestId to EditorRequest and pass it from dialog-mode CapturePayload in app-context. Key ItemDialogInner by requestId so every new protocol request resets its fields. Keep clipboard mode’s direct-save behavior and use plan 1 fetchMetadata to save full metadata.
- [ ] Step 6: Run the queue/parser tests and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 7: Commit as feat: open protocol links in capture dialog.

### Task 3: Add the Chrome and Edge context-menu helper

**Files:**
- Create: browser-extension/manifest.json, browser-extension/service-worker.js, browser-extension/captureUrl.js, browser-extension/README.md
- Create: tests/browser-extension/captureUrl.test.ts, tests/browser-extension/serviceWorker.test.ts
- Modify: package.json, README.md

**Interfaces:**
- Produces: createCaptureUrl(url: string, title?: string) -> string, returning an encoded urlflow://add URL.

- [ ] Step 1: Add failing tests named encodesPageUrlAndTitle and omitsEmptyTitle. Assert round-tripping through URL preserves the exact page URL and title. Add prefersLinkTargetToTabUrl and assert a link-context menu uses linkUrl and omits the active page title.
- [ ] Step 2: Run npm test -- --run tests/browser-extension/captureUrl.test.ts tests/browser-extension/serviceWorker.test.ts. Expected: FAIL because the helper and service worker do not exist.
- [ ] Step 3: Implement a Manifest V3 context-menu service worker for page and link contexts. For a clicked link use linkUrl; otherwise use the active tab URL. Pass the tab title only for the current page, and open the encoded protocol URL after a user click.
- [ ] Step 4: Add installation instructions for loading the extension unpacked in Chrome or Edge, and include the browser-extension directory in release files.
- [ ] Step 5: Run npm test -- --run tests/browser-extension/captureUrl.test.ts tests/browser-extension/serviceWorker.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 6: Commit as feat: add browser context-menu capture helper.
