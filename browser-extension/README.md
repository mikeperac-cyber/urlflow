# URL Flow Capture for Chrome and Edge

This small Manifest V3 extension sends a page or link to the URL Flow desktop capture dialog.
Install and launch URL Flow first so Windows registers its `urlflow://` handler.

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

## Capture a page or link

- Right-click a page background and choose **Save page to URL Flow**. The dialog receives
  that tab's URL and title.
- Right-click a link and choose **Save link to URL Flow**. The dialog receives the link's
  destination without using the current page's title.
- If the browser asks to open URL Flow, allow it. Review the capture dialog and save.
  URL Flow accepts HTTP and HTTPS links; unsupported targets are rejected by the app.

The helper opens a browser tab to the encoded `urlflow://add` request only after your menu
click. Depending on the browser, that handoff can leave an empty tab that you can close.
If Windows has no handler, install and launch URL Flow, then try again.

## Permissions

`contextMenus` adds the two menu items. `activeTab` allows the current tab's URL/title to
be supplied after your explicit menu action. There are no host permissions, content scripts,
page-content readers, remote services, or background capture.

After changing extension files, choose **Reload** on its extensions-page card.
