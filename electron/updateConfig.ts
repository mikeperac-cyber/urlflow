export interface ReleaseUpdateConfig {
  feedUrl: string;
  publisherName: string;
}

/** Only public release metadata is returned; signing credentials stay in the environment. */
export function readReleaseConfig(env: Record<string, string | undefined>): ReleaseUpdateConfig {
  let feed: URL;
  try {
    feed = new URL(env.URL_FLOW_UPDATE_URL ?? '');
    if (feed.protocol !== 'https:' || feed.username || feed.password || feed.search || feed.hash) throw new Error();
  } catch {
    throw new Error('Set URL_FLOW_UPDATE_URL to an HTTPS update-feed directory without credentials, query or fragment.');
  }
  const publisherName = env.URL_FLOW_PUBLISHER_NAME?.trim() ?? '';
  if (!publisherName || /[\r\n\0]/.test(publisherName)) {
    throw new Error('Set URL_FLOW_PUBLISHER_NAME to the exact Authenticode certificate publisher.');
  }
  if (!env.WIN_CSC_LINK?.trim() && !env.CSC_LINK?.trim()) {
    throw new Error('Release signing requires WIN_CSC_LINK or CSC_LINK in the release environment.');
  }
  return { feedUrl: feed.href, publisherName };
}
