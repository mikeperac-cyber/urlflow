import {
  buildLinksBatch,
  buildPlanBatch,
  buildTabGroupOptions,
  collectTabs,
  createBatchCaptureUrls,
} from './tabs.js';

const countLine = document.querySelector('#count');
const tagInput = document.querySelector('#tags');
const groupSelect = document.querySelector('#group');
const planTitle = document.querySelector('#plan-title');
const saveLinks = document.querySelector('#save-links');
const savePlan = document.querySelector('#save-plan');
const status = document.querySelector('#status');

let tabs = [];
let groups = [];
let entries = [];

function tags() {
  return tagInput.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function setStatus(message) {
  status.textContent = message;
}

async function send(batch) {
  try {
    const urls = createBatchCaptureUrls(batch);
    for (const url of urls) await chrome.tabs.create({ url, active: false });
    setStatus(`Sent ${batch.entries.length} tabs to URL Flow`);
    window.setTimeout(() => window.close(), 900);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not send the tabs.');
  }
}

async function init() {
  try {
    tabs = await chrome.tabs.query({ currentWindow: true });
    entries = collectTabs(tabs);
    const windowId = tabs[0]?.windowId;
    if (windowId !== undefined) {
      try {
        groups = await chrome.tabGroups.query({ windowId });
      } catch {
        groups = [];
      }
    }

    countLine.textContent = `${entries.length} ${entries.length === 1 ? 'web tab' : 'web tabs'} in this window`;
    for (const option of buildTabGroupOptions(tabs, groups)) {
      const element = document.createElement('option');
      element.value = String(option.id);
      element.textContent = `${option.title} (${option.entries.length})`;
      groupSelect.append(element);
    }
  } catch {
    countLine.textContent = 'Could not read this window.';
  }
  saveLinks.disabled = entries.length === 0;
  savePlan.disabled = entries.length === 0;
}

saveLinks.addEventListener('click', () => {
  if (entries.length === 0) return;
  void send(buildLinksBatch(entries, tags()));
});

savePlan.addEventListener('click', () => {
  const selected = groupSelect.value;
  const option = selected === ''
    ? null
    : buildTabGroupOptions(tabs, groups).find((entry) => String(entry.id) === selected) ?? null;
  const selection = option ? option.entries : entries;
  if (selection.length === 0) return;
  const fallback = option?.title ?? 'Tabs from this window';
  void send(buildPlanBatch(selection, { title: planTitle.value.trim() || fallback, tags: tags() }));
});

void init();
