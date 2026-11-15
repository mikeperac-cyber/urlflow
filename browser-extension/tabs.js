export const MAX_TABS = 200;
const WEB_URL = /^https?:\/\//i;
const CHUNK_SIZE = 1200;

function webEntries(tabs) {
  const entries = [];
  for (const tab of tabs ?? []) {
    const url = typeof tab?.url === 'string' ? tab.url.trim() : '';
    if (!WEB_URL.test(url)) continue;
    const title = typeof tab?.title === 'string' ? tab.title.trim().slice(0, 300) : '';
    entries.push(title ? { url, title } : { url });
    if (entries.length >= MAX_TABS) break;
  }
  return entries;
}

/** Keeps web tabs in window order, including duplicate URLs opened twice. */
export function collectTabs(tabs) {
  return webEntries(tabs);
}

export function buildLinksBatch(entries, tags = []) {
  return { kind: 'links', entries, ...(tags.length > 0 ? { tags } : {}) };
}

export function buildPlanBatch(entries, { title, color, tags = [] } = {}) {
  return {
    kind: 'plan',
    title: String(title ?? '').trim().slice(0, 300),
    entries,
    ...(color ? { color } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  };
}

export function encodeBatch(batch) {
  const bytes = new TextEncoder().encode(JSON.stringify(batch));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBatchId() {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Splits a batch into protocol URLs Electron can assemble. Windows protocol
 * handoff is capped well below command-line limits, so each URL stays <= 1800 characters.
 */
export function createBatchCaptureUrls(batch, { batchId = randomBatchId(), maxLength = 1800 } = {}) {
  const payload = encodeBatch(batch);
  const chunks = [];
  for (let index = 0; index < payload.length; index += CHUNK_SIZE) {
    chunks.push(payload.slice(index, index + CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('');
  const urls = chunks.map(
    (data, index) => `urlflow://add?batchId=${batchId}&i=${index}&n=${chunks.length}&d=${data}`,
  );
  if (urls.some((url) => url.length > maxLength)) {
    throw new Error('That tab batch is too large to send.');
  }
  return urls;
}

/** One option per tab group, with titles supplied by chrome.tabGroups. */
export function buildTabGroupOptions(tabs, groups) {
  const titles = new Map((groups ?? []).map((group) => [group.id, String(group.title ?? '').trim()]));
  const byGroup = new Map();
  for (const tab of tabs ?? []) {
    const groupId = typeof tab?.groupId === 'number' ? tab.groupId : -1;
    if (groupId < 0) continue;
    const url = typeof tab?.url === 'string' ? tab.url.trim() : '';
    if (!WEB_URL.test(url)) continue;
    const entries = byGroup.get(groupId) ?? [];
    const title = typeof tab?.title === 'string' ? tab.title.trim().slice(0, 300) : '';
    entries.push({ url, title });
    byGroup.set(groupId, entries);
  }
  return [...byGroup.entries()].map(([id, entries]) => ({
    id,
    title: titles.get(id) || `Tab group ${id}`,
    entries,
  }));
}
