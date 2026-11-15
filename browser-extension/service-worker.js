import { createCaptureUrl } from './captureUrl.js';

const PAGE_MENU = 'urlflow-capture-page';
const LINK_MENU = 'urlflow-capture-link';
const SELECTION_MENU = 'urlflow-capture-selection';

chrome.runtime.onInstalled.addListener(() => {
  // Re-registering keeps existing installs from accumulating stale menu ids.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: PAGE_MENU, title: 'Save page to URL Flow', contexts: ['page'] });
    chrome.contextMenus.create({ id: LINK_MENU, title: 'Save link to URL Flow', contexts: ['link'] });
    chrome.contextMenus.create({
      id: SELECTION_MENU,
      title: 'Save selection to URL Flow',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SELECTION_MENU) {
    if (!tab?.url || !info.selectionText?.trim()) return;
    chrome.tabs.create({ url: createCaptureUrl(tab.url, tab.title, info.selectionText) });
    return;
  }
  if (info.menuItemId !== PAGE_MENU && info.menuItemId !== LINK_MENU) return;
  const isLink = info.menuItemId === LINK_MENU;
  const url = isLink ? info.linkUrl : tab?.url;
  if (!url) return;
  chrome.tabs.create({ url: createCaptureUrl(url, isLink ? undefined : tab?.title) });
});
