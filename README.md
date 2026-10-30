# URL Flow

A Windows desktop app for keeping track of the links you collect, the plans you are working through,
and everything around them: notes, steps, tasks, reminders, duplicate detection, merging and archiving.

Built with Electron, React and TypeScript. All data lives on this machine — no account, no cloud.

## Install

Version 1.1.0 has three packaging commands:

| File | Use it when |
| --- | --- |
| `release/URL-Flow-Setup-1.1.0.exe` | Signed release installer with automatic updates. Per-user, creates Start Menu and desktop shortcuts. |
| `release/local/URL-Flow-Setup-1.1.0-LOCAL.exe` | Local installer when release signing/feed are not configured. Update checks are unavailable; install later versions manually. It may be unsigned. |
| `release/portable/URL-Flow-Portable-1.1.0.exe` | Run without installing. Automatic updates are unavailable. |

Your data is stored in `%APPDATA%\URL Flow\url-flow-data.json`. Use **Settings → Data** to open that
folder, export a JSON backup, or import one. Backups are validated before they replace anything.
Installers and uninstallers retain this data directory. Before a clean reinstall, keep an exported
backup or copy of the data folder outside the app's installation folder. Uninstall the application,
then run the new installer; it will load the existing data and preferences.

**Upgrading from 1.0.0:** install 1.1.0 manually once. Version 1.0.0 has no updater, so it cannot
download this upgrade itself. Signed release builds of 1.1.0 can check and download later releases;
downloaded updates install on normal app quit or through **Settings → Updates → Restart to install**.

The app keeps running in the system tray so reminders still fire after you close the window
(this can be switched off in Settings).

## Capture from Chrome or Edge

Install and launch URL Flow, then open `chrome://extensions` in Chrome or `edge://extensions`
in Edge. Enable **Developer mode**, choose **Load unpacked**, and select the `browser-extension`
folder from this source checkout or `resources/browser-extension` inside your installed app's
folder. Keep that folder in place. Portable users should use a persistent copy from the source
checkout because portable app resources are temporary.

Right-click a page background and choose **Save page to URL Flow**, or right-click a link and
choose **Save link to URL Flow**. Allow the browser's request to open URL Flow if prompted,
then review and save in the capture dialog. Links use the clicked destination; pages include
the tab title. See [the helper instructions](browser-extension/README.md) for details.

## What it does

- **Links** — save a URL, fetch its page title automatically, add notes and tags, mark favorites,
  open in your default browser. The last-opened time is tracked per link.
- **Plans** — give a goal a summary, target date, colour and an ordered list of steps. Each step can
  carry a due date and notes, move up or down, or turn into a task in one click. Attach tasks, links and
  notes to the plan.
- **Tasks** — priorities, optional due dates, one-click completion, and grouping by plan.
- **Notes** — free-form notes with pinning, tags and search.
- **Reminders** — schedule a nudge for any link, plan, task or note, with daily, weekday, weekly or
  monthly repeats. A native notification fires at the scheduled time; snooze, dismiss, or see anything
  that came due while notifications were unavailable under Missed.
- **Matches** — finds duplicate and related items automatically: identical URLs, same page on a site,
  similar titles, and similar task or note wording. Ignore a suggestion to hide it.
- **Merging** — merge a match group into one item. Notes and steps combine, tags are de-duplicated,
  reminders move to the surviving item, and attached items are re-pointed instead of lost. For a pair,
  choose which title, notes and date survive before merging.
- **Archive** — archive anything instead of deleting it; archived items keep their content, are hidden
  from matching and the main lists, and can be restored at any time.
- **Undo and redo** — every change is reversible, not just the last toast action: `Ctrl+Z` and
  `Ctrl+Shift+Z` walk a 40-step history that survives the window being reloaded, including archives,
  merges, deletions, imports and reminder changes.
- **Command palette** — `Ctrl+K` finds any link, plan, task or note across the workspace, jumps between
  views, creates items and runs actions like export or backup.
- **Quick capture** — from anywhere in Windows, `Ctrl+Shift+Space` (or the tray menu) saves the link on
  your clipboard, reads its title and files it in one step.
- **Weekly review** — one screen walks through overdue tasks, links that went quiet, plans that stopped
  moving and pending duplicates, offering keep, archive, complete or reschedule.
- **Bookmark import** — read a Chrome, Edge or Firefox HTML export, tag links by their folder, and skip
  addresses already saved.
- **Automatic backups** — a snapshot of the workspace is written each day, the last seven are kept, and
  any of them can be restored from Settings (which is itself undoable).
- **Search, filters, dashboard** — per-view search, status tabs, tag filters, and a dashboard with what
  is due today and coming up.
- **Appearance** — starts in your Windows light or dark appearance, with a manual switch in the sidebar.

## Screens

![Dashboard in light appearance](screenshots/ios-02-dashboard-light.png)

![Plan detail in dark appearance](screenshots/ios-04-plan-dark.png)

Keyboard: `Ctrl+K` opens the command palette, `Ctrl+N` creates a new item of the current view's type,
`Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, and `Ctrl+Shift+Space` captures the link on your clipboard
from anywhere in Windows.

## Development

```bash
npm install
npm run dev        # Vite renderer + Electron shell with hot reload
npm run typecheck  # TypeScript for the renderer and the Electron main/preload
npm run build      # production renderer bundle + compiled main process
npm run dist:local # local NSIS installer, no feed or signing setup needed
npm run dist:portable # portable exe; independent of release setup
npm run dist       # authenticated release NSIS installer; requires the environment below
```

Packaging uses the Electron runtime already installed in `node_modules/electron/dist`
(`build.electronDist` in `package.json`); reinstall dependencies to refresh it after an Electron upgrade.
Packaging retains the `en-US` and `tr` Electron locale files. The application interface remains English.

## Signed Windows releases

`npm run dist` fails closed unless the release environment contains:

- `URL_FLOW_UPDATE_URL`: an HTTPS directory URL for the update feed, without credentials, query or fragment.
- `URL_FLOW_PUBLISHER_NAME`: the exact publisher from the Authenticode signing certificate.
- `WIN_CSC_LINK` or `CSC_LINK`: the signing certificate through electron-builder's supported environment input.
- `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD` when the certificate needs a password.

Configure these locally or through a release secret store; do not put certificate material or passwords
in source. Release packaging requires code signing and keeps Windows update signature verification
enabled. The release build embeds the public HTTPS feed and expected publisher in `app-update.yml`;
installed apps verify downloaded installers against that publisher. Development, LOCAL and portable
builds do not initialize the updater, even if release environment variables are later present at runtime.

All packaging commands pass `--publish never`. After reviewing a signed release, upload its
`URL-Flow-Setup-<version>.exe`, matching `.exe.blockmap`, and `latest.yml` from `release/` to the
configured HTTPS directory yourself. Keep metadata and installer from the same build together.
No upload or publication is performed by these commands. A LOCAL installer has no update feed or
`app-update.yml`, and must never be used as the signed update artifact.
