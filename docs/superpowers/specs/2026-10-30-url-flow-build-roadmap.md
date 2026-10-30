# URL Flow Build Roadmap — Source Requirements

This document records the five requirements supplied by the product owner on 2026-10-30. Each requirement has a separate implementation plan under docs/superpowers/plans.

## 1. Rich link enrichment

Today capture fetches only the page title; cards use color initials instead of real site identity. Fetch og:title, description, site name, and cache favicons locally; show them on cards and in the save dialog.

Done when: pasting a GitHub or docs URL looks finished before notes are entered.

## 2. Zero-friction capture

Register urlflow://add?url=… and optionally add an “Open with URL Flow” action or thin browser helper so a page can land in the capture dialog with its title filled.

Done when: saving from the browser does not require copying the address bar.

## 3. Reading states and Sites view

Add unread, later, and read states to links; add a Sites view grouped by host; connect stale-link review to unread and later links.

Done when: “what should I open this week?” is a filter rather than a scavenger hunt.

## 4. Bulk triage

Add multi-select on Links first, with a later path to Tasks and Notes. Selected links can be tagged, assigned to a plan, archived, opened, or have their match groups ignored.

Done when: a 200-bookmark import can be cleaned in one session without 200 dialogs.

## 5. Ship hardening

Add unit tests for URL normalization, merge, matching, and reminders; add electron-updater; add Settings for the capture shortcut and reminder sound and quiet hours.

Done when: URL Flow 1.1 can ship with merge behavior covered and installed builds able to update themselves.

## Planning decisions

- Keep the five workstreams as separate plans because their data contracts and UI surfaces are independently reviewable.
- Execute in roadmap order: plan 2 consumes plan 1's metadata API; plan 4 consumes plan 3's reading-state API; plan 5 consumes plan 1's Vitest setup.
- The browser helper in plan 2 is included because the stated completion condition cannot be met by protocol registration alone. It is a minimal Manifest V3 context-menu extension for Chrome and Edge; the user can load it unpacked.
- Plan 4 implements multi-select on Links only. Extending selection to Tasks and Notes is a later follow-up, as the source requirement says “then Tasks/Notes.”
- New and migrated links default to unread. Opening a link marks it read. Review’s “keep” action preserves its current reading state and review cooldown.
- Favicon bytes live under Electron’s userData directory under a hashed cache key. Link records persist the key, not an absolute machine path. A missing cache entry falls back to the existing initials.
- Protocol capture opens the save dialog. It accepts an optional title parameter and uses page metadata to fill the title when none is supplied. Existing clipboard hotkey behavior remains a direct save.
- Reminder sound defaults on. Quiet hours default off; when a reminder becomes due in quiet hours it stays pending and fires after quiet hours end.
- Auto-update uses electron-updater with a generic HTTPS feed supplied through URL_FLOW_UPDATE_URL and the existing Windows NSIS installer target. Portable builds do not self-update. The current project has no update-feed URL or Windows signing configuration; these are release inputs, not invented values. URL Flow 1.0.0 has no updater, so updating 1.0.0 users to 1.1.0 requires one manual installer run; 1.1.0 can update later releases.
- The current workspace snapshot contains no .git directory. Implementation under the requested subagent-driven workflow needs a Git checkout so it can run in an isolated worktree.
