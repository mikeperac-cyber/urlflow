# URL Flow Capture for Chrome and Edge

This Manifest V3 extension sends a page, a link, a highlighted selection, or every tab in
the current window to the URL Flow desktop app. Install and launch URL Flow first so Windows
registers its `urlflow://` handler.

## One-time installation

1. Find this `browser-extension` folder. In a URL Flow installation it is inside
   `resources/browser-extension` next to the app executable. Developers can use the folder
   directly from the source checkout. Keep the chosen folder in place after loading it.
   For portable builds, use a persistent copy of this folder from the source checkout;
   the packaged resources are extracted temporarily while the portable app runs.
2. In Chrome, open `chrome://extensions`. In Edge, open `edge://extensions`.
3. Turn on **Developer mode**, choose **Load unpacked**, and select the `browser-extension`
   folder containing `manifest.json`.
4. Repeat in each browser/profile where you want capture available.

## Capture one page, link or selection

- Right-click a page background and choose **Save page to URL Flow**. The dialog receives
  that tab's URL and title.
- Right-click a link and choose **Save link to URL Flow**. The dialog receives the link's
  destination without using the current page's title.
- Select text, right-click it, and choose **Save selection to URL Flow**. The dialog
  opens with that page's URL and title, and the highlighted text is prefilled in the notes
  field as a Markdown blockquote (`> ...`).
- If the browser asks to open URL Flow, allow it. Review the capture dialog and save.
  URL Flow accepts HTTP and HTTPS links; unsupported targets are rejected by the app.

## Capture every tab or a tab group

Click the URL Flow Capture toolbar button to open the popup.

- **Save all tabs as links** saves every HTTP/HTTPS tab in the current window as its own
  link, in tab order. Add comma-separated tags first to tag them all.
- **Save tabs as a plan** creates one plan named after the chosen tab group, or after the
  title you type. Every tab is attached to that plan as a link, in tab order. Choose
  **All web tabs** or a specific group in the dropdown.
- A batch is saved as one change, so a single Undo removes the whole set. Unsafe or
  internal pages (`chrome://`, `edge://`, `file:`) are skipped and reported in the toast.

Large batches are split into several `urlflow://add` request URLs that URL Flow assembles
in the background. Each helper tab can be closed once it hands the request over.

## Permissions

`contextMenus` adds the three right-click items. `activeTab` supplies the current tab's
URL, title and selection after your explicit menu action. `tabs` lets the popup list the
window's tabs and their URLs, and `tabGroups` reads group names for the plan title. There
are no host permissions, content scripts, page-content readers, remote services, or
background capture.

After changing extension files, choose **Reload** on its extensions-page card.
