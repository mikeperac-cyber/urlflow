import { describe, expect, it } from 'vitest';
import { readReleaseConfig } from '../../electron/updateConfig';

describe('release update configuration', () => {
  it('requiresHttpsFeed', () => {
    for (const feed of [undefined, '', 'http://example.com/updates', 'file:///updates', 'https://user:secret@example.com/updates']) {
      expect(() => readReleaseConfig({ URL_FLOW_UPDATE_URL: feed, URL_FLOW_PUBLISHER_NAME: 'URL Flow', CSC_LINK: 'certificate.pfx' })).toThrow(/HTTPS/i);
    }
    expect(readReleaseConfig({ URL_FLOW_UPDATE_URL: 'https://example.com/updates/', URL_FLOW_PUBLISHER_NAME: 'URL Flow', CSC_LINK: 'certificate.pfx' }))
      .toEqual({ feedUrl: 'https://example.com/updates/', publisherName: 'URL Flow' });
  });

  it('rejectsMissingPublisher', () => {
    for (const publisher of [undefined, '', '   ', 'URL Flow\nOther']) {
      expect(() => readReleaseConfig({ URL_FLOW_UPDATE_URL: 'https://example.com/updates', URL_FLOW_PUBLISHER_NAME: publisher, CSC_LINK: 'certificate.pfx' })).toThrow(/publisher/i);
    }
  });

  it('requiresSigningCredentialsForARelease', () => {
    expect(() => readReleaseConfig({ URL_FLOW_UPDATE_URL: 'https://example.com/updates', URL_FLOW_PUBLISHER_NAME: 'URL Flow' })).toThrow(/signing/i);
    expect(readReleaseConfig({ URL_FLOW_UPDATE_URL: 'https://example.com/updates', URL_FLOW_PUBLISHER_NAME: 'URL Flow', WIN_CSC_LINK: 'certificate.pfx' }).publisherName).toBe('URL Flow');
  });
});
