# Ship Hardening Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Cover critical local data behavior with unit tests, make reminder and capture preferences configurable, and enable authenticated updates for installed Windows builds.

**Architecture:** Reuse the Vitest runner introduced by plan 1 to test pure shared logic. Normalize a typed preferences record in both desktop and browser modes. Integrate electron-updater with the existing NSIS target and a generic HTTPS feed, reporting updater status through the preload bridge and Settings.

**Tech Stack:** Electron 45, electron-builder 26, electron-updater compatible with the existing builder, React 19, TypeScript 7, Vitest.

**Spec:** docs/superpowers/specs/2026-10-30-url-flow-build-roadmap.md — section 5.

## Global Constraints

- Keep all workspace data local and preserve 1.0.0 backups and preferences.
- Keep the capture shortcut default at CommandOrControl+Shift+Space; reminder sound defaults on and quiet hours default off.
- During quiet hours, leave due reminders pending and deliver them after quiet hours end.
- Auto-update is enabled only for packaged Windows NSIS installs; portable builds and development do not check for updates.
- Never disable Windows update signature verification. Release packaging requires URL_FLOW_UPDATE_URL over HTTPS and a matching Authenticode signing identity supplied through the release environment.
- Set the application version to 1.1.0 in package.json and package-lock.json; do not publish installers or upload feed artifacts in this plan.
- Do not publish artifacts from this plan. 1.0.0 users need one manual upgrade to 1.1.0 because their installed app contains no updater.

## Review Focus

- Query ordering, tracking parameters, and malformed URL input must preserve the current normalizer contract; test in url.test.ts.
- Merging items must retain notes, tags, relationships, and reminders; test mergeItems integrity and invalid/missing IDs.
- An ignored match pair must not reappear, while other independent pairs remain visible; test matching.
- Reminders exactly at now, already notified, and repeated across missed intervals must follow current core behavior; test fixed-clock cases.
- Quiet-hour ranges crossing midnight and exact start/end boundaries must defer only during the configured interval; test preferences/reminders.

---

## File Map

- tests/shared/url.test.ts, merge.test.ts, matching.test.ts, and reminders.test.ts cover the four user-named high-stakes behaviors.
- shared/preferences.ts normalizes preferences and evaluates quiet-hour intervals; shared/types.ts and FlowApi carry preferences and updater status.
- electron/main.ts applies capture shortcut and reminder preferences and coordinates updater events; electron/preload.ts and src/lib/browserApi.ts expose typed APIs.
- src/views/Settings.tsx adds shortcut, sound, quiet-hour, and update controls.
- electron-builder.config.cjs, package.json, and package-lock.json configure the HTTPS feed and updater dependency without storing secrets.
- README.md documents the one-time 1.0.0-to-1.1.0 upgrade and required release environment.

### Task 1: Add unit coverage for URL, merge, matching, and reminders

**Files:**
- Create: tests/shared/url.test.ts, tests/shared/merge.test.ts, tests/shared/matching.test.ts, tests/shared/reminders.test.ts
- Modify: shared/url.ts, shared/core.ts, shared/matching.ts only if a test exposes a defect

**Interfaces:**
- Consumes: Vitest setup from plan 1.
- Tests public shared helpers without Electron or network access.

- [ ] Step 1: Add URL tests named removesTrackingParametersAndSortsQuery and rejectsUnsafeExternalProtocols. Assert the normalized result is https://example.com/a?a=1&b=2 for an input containing www, a trailing slash, a fragment, utm_source, and unsorted retained parameters; assert javascript: input is not safe.
- [ ] Step 2: Add merge tests named mergeKeepsNotesTagsAndBothReminders and mergeRejectsMissingOrDifferentKinds. Assert both reminder itemIds point to the primary, both notes and unique tags survive, and invalid merges throw.
- [ ] Step 3: Add matching tests named ignoresOnlyTheRequestedPair and excludesArchivedItems. Assert the ignored sorted pair disappears while an unrelated duplicate and archived pair do not appear.
- [ ] Step 4: Add reminder tests named dueReminderIncludesExactBoundary and repeatAdvancesPastMissedIntervals. Use fixed dates; assert dueAt exactly now is due, notified reminders are excluded, and a weekly reminder advances to a future occurrence.
- [ ] Step 5: Run npm test -- --run tests/shared/url.test.ts tests/shared/merge.test.ts tests/shared/matching.test.ts tests/shared/reminders.test.ts. Expected: all assertions PASS against the behavior implemented in prior plans; if an assertion fails, preserve it as a regression test.
- [ ] Step 6: Fix only defects demonstrated by a failing assertion, then rerun those four files and npm run typecheck. Expected: all tests and both TypeScript projects PASS; if all tests passed already, make no behavior change.
- [ ] Step 7: Commit as test: cover URL core merge matching and reminders.

### Task 2: Add typed capture and reminder preferences

**Files:**
- Create: shared/preferences.ts, tests/shared/preferences.test.ts
- Modify: shared/types.ts, electron/main.ts, electron/preload.ts, src/lib/browserApi.ts, src/app-context.tsx, src/views/Settings.tsx

**Interfaces:**
- Preferences contains closeToTray, captureShortcut, reminderSound, quietHoursStart, and quietHoursEnd.
- Defaults: closeToTray true, captureShortcut CommandOrControl+Shift+Space, reminderSound true, and both quiet-hour values empty.
- Produces: normalizePreferences(raw: unknown) -> Preferences and isInQuietHours(now: Date, start: string, end: string) -> boolean.

- [ ] Step 1: Add failing tests named preservesCloseToTrayForLegacyPreferences, defaultsInvalidValues, handlesOvernightQuietHours, and treatsStartAsQuietAndEndAsOpen.
- [ ] Step 2: Run npm test -- --run tests/shared/preferences.test.ts. Expected: FAIL because the preference helpers do not exist.
- [ ] Step 3: Implement preference normalization and quiet-hour evaluation. Empty or invalid times disable quiet hours; equal start and end disable the interval.
- [ ] Step 4: Replace the boolean-only preference setter with a typed key/value contract. Apply shortcut changes by unregistering the previous accelerator, registering the candidate, and restoring the previous value if registration fails.
- [ ] Step 5: In tickReminders, do not mark or notify due reminders while quiet hours are active; after the interval ends, process the pending reminders normally. Pass reminderSound to Electron Notification.silent.
- [ ] Step 6: Add Settings controls for the capture shortcut, reminder sound, quiet-hours start/end, preserving the current close-to-tray toggle. Persist preferences through the desktop and browser APIs.
- [ ] Step 7: Run npm test -- --run tests/shared/preferences.test.ts tests/shared/reminders.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS.
- [ ] Step 8: Commit as feat: configure capture and reminder preferences.

### Task 3: Add authenticated NSIS updates and Settings status

**Files:**
- Create: electron/updates.ts, electron/updateConfig.ts, electron-builder.config.cjs, tests/electron/updateConfig.test.ts
- Modify: package.json, package-lock.json, shared/types.ts, electron/main.ts, electron/preload.ts, src/lib/browserApi.ts, src/views/Settings.tsx, README.md

**Interfaces:**
- UpdateStatus is a discriminated state: idle, checking, available, downloading, downloaded, not-available, or error; version and percent are optional.
- FlowApi exposes checkForUpdates(), installUpdate(), and onUpdateStatus(callback).
- updateConfig accepts URL_FLOW_UPDATE_URL and URL_FLOW_PUBLISHER_NAME only from the release environment; no credential is stored in source.

- [ ] Step 1: Add failing config tests named requiresHttpsFeed and rejectsMissingPublisher. Assert non-HTTPS or missing feed and publisher inputs fail closed.
- [ ] Step 2: Run npm test -- --run tests/electron/updateConfig.test.ts. Expected: FAIL because updater config validation does not exist.
- [ ] Step 3: Add electron-updater and configure the Windows NSIS publisher with the generic HTTPS URL and Authenticode publisher name. Require the release environment values for the NSIS dist command and keep portable packaging independent.
- [ ] Step 4: Initialize the updater only in packaged, non-portable mode. Check once at startup, download available updates automatically, and install on app quit. Send checking, available, progress, downloaded, not-available, and error status through a typed preload event; expose manual check and install-and-restart methods.
- [ ] Step 5: Add Settings status and actions for checking, downloading, up-to-date, error, and restart-to-install states. Do not offer update actions in browser preview or development.
- [ ] Step 6: Bump package.json and package-lock.json to version 1.1.0.
- [ ] Step 7: Update README release instructions for the HTTPS feed, signing environment, NSIS upload artifacts, and the one-time manual upgrade from 1.0.0 to 1.1.0.
- [ ] Step 8: Run npm test -- --run tests/electron/updateConfig.test.ts and npm run typecheck. Expected: tests PASS and both TypeScript projects PASS. A release package build additionally requires the release feed and signing credentials.
- [ ] Step 9: Commit as feat: add authenticated Windows update checks.
