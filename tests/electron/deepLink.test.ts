import { describe, expect, it } from 'vitest';
import { parseCaptureProtocol } from '../../electron/deepLink';

describe('parseCaptureProtocol', () => {
  it('parsesUrlAndOptionalTitle', () => {
    expect(parseCaptureProtocol('urlflow://add?url=https%3A%2F%2Fwww.Example.com%2Fguide%2F%3Futm_source%3Dmail%26b%3D2%26a%3D1%23section&title=%20A%20guide%20%26%20tips%20&unknown=ignored'))
      .toEqual({ url: 'https://example.com/guide?a=1&b=2', title: 'A guide & tips', mode: 'dialog' });
    expect(parseCaptureProtocol('urlflow://add?url=http%3A%2F%2Fexample.com%2F'))
      .toEqual({ url: 'http://example.com/', mode: 'dialog' });
    expect(parseCaptureProtocol('urlflow://add?url=https%3A%2F%2Fexample.com&title=%20%20'))
      .toEqual({ url: 'https://example.com/', mode: 'dialog' });
  });

  it('protocolCaptureUsesDialogMode', () => {
    expect(parseCaptureProtocol('urlflow://add?url=https%3A%2F%2Fexample.com&mode=clipboard&requestId=external'))
      .toEqual({ url: 'https://example.com/', mode: 'dialog' });
  });

  it('rejectsWrongRouteAndScheme', () => {
    for (const raw of [
      'https://add?url=https%3A%2F%2Fexample.com',
      'other://add?url=https%3A%2F%2Fexample.com',
      'urlflow://remove?url=https%3A%2F%2Fexample.com',
      'urlflow://add/other?url=https%3A%2F%2Fexample.com',
      'urlflow://user@add?url=https%3A%2F%2Fexample.com',
      'urlflow://add:123?url=https%3A%2F%2Fexample.com',
    ]) expect(parseCaptureProtocol(raw), raw).toBeNull();
  });

  it('rejectsUnsafeOrMissingUrl', () => {
    for (const raw of ['', 'not a protocol URL', 'urlflow://add', 'urlflow://add?url=', 'urlflow://add?url=%ZZ']) {
      expect(parseCaptureProtocol(raw), raw).toBeNull();
    }
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'ftp://example.com/file', 'mailto:test@example.com', 'example.com', '//example.com', 'https://', 'https://exa mple.com']) {
      expect(parseCaptureProtocol(`urlflow://add?url=${encodeURIComponent(url)}`), url).toBeNull();
    }
    expect(parseCaptureProtocol('urlflow://add?url=https%3A%2F%2Fexample.com&title=%E0%A4%A')).toBeNull();
  });
});
