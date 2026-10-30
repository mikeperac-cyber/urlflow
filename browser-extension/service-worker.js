import { createCaptureUrl } from './captureUrl.js';

const PAGE_MENU = 'urlflow-capture-page';
const LINK_MENU = 'urlflow-capture-link';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: PAGE_MENU, title: 'Save page to URL Flow', contexts: ['page'] });
  chrome.contextMenus.create({ id: LINK_MENU, title: 'Save link to URL Flow', contexts: ['link'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== PAGE_MENU && info.menuItemId !== LINK_MENU) return;
  const isLink = info.menuItemId === LINK_MENU;
  const url = isLink ? info.linkUrl : tab?.url;
  if (!url) return;
  chrome.tabs.create({ url: createCaptureUrl(url, isLink ? undefined : tab?.title) });
});
