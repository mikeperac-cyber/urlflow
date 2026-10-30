import { describe, expect, it } from 'vitest';
import { parsePageMetadata } from '../../electron/pageMetadata';

describe('parsePageMetadata', () => {
  it('ignoresApparentMetadataInsideTitleText', () => {
    const html = '<title>Using <meta property="og:title" content="Wrong"> safely</title><meta property="og:title" content="Actual">';
    expect(parsePageMetadata(html, 'https://example.com').title).toBe('Actual');
    expect(parsePageMetadata('<title>Using <link rel="icon" href="/fake.ico"> safely</title>', 'https://example.com')).toEqual({
      title: 'Using <link rel="icon" href="/fake.ico"> safely',
      description: null, siteName: null, faviconUrl: null,
    });
  });

  it('leavesUnknownEntitiesMatchingObjectPropertiesLiteral', () => {
    expect(parsePageMetadata('<title>&constructor; &toString; &amp;</title>', 'https://example.com').title)
      .toBe('&constructor; &toString; &');
  });

  it('parsesOpenGraphTitleDescriptionSiteNameAndRelativeIcon', () => {
    const html = `
      <title>Fallback title</title>
      <meta name="description" content="Fallback description">
      <meta content="  News &amp; Ideas &#x2014; Today  " property="og:title">
      <meta property='og:description' content='A &quot;useful&quot; summary &#39;here&#39;'>
      <meta content="Example&nbsp;News" property="og:site_name">
      <link href="../icons/site.png?size=32&amp;theme=light" rel="shortcut icon">
    `;

    expect(parsePageMetadata(html, 'https://example.com/articles/story')).toEqual({
      title: 'News & Ideas — Today',
      description: 'A "useful" summary \'here\'',
      siteName: 'Example News',
      faviconUrl: 'https://example.com/icons/site.png?size=32&theme=light',
    });
  });

  it('fallsBackToHtmlTitleAndDescriptionMeta', () => {
    const html = `
      <TITLE>  A &amp; B\n Guide &#8212; Tips </TITLE>
      <META CONTENT='Learn &lt;more&gt; &amp; enjoy' NAME='description'>
      <meta property="og:title" content=" ">
      <link rel="stylesheet" href="/app.css">
    `;

    expect(parsePageMetadata(html, 'https://example.com/guide')).toEqual({
      title: 'A & B Guide — Tips',
      description: 'Learn <more> & enjoy',
      siteName: null,
      faviconUrl: null,
    });
    expect(parsePageMetadata('<title>HTML title</title><meta property="og:description" content="OG summary">', 'https://example.com')).toEqual({
      title: 'HTML title', description: 'OG summary', siteName: null, faviconUrl: null,
    });
  });

  it('returnsNullFieldsWhenMetadataIsAbsent', () => {
    expect(parsePageMetadata('<html><body>Hello</body></html>', 'https://example.com')).toEqual({
      title: null, description: null, siteName: null, faviconUrl: null,
    });
  });

  it('ignoresCommentedAndScriptMetadataAndHandlesQuotedDelimiters', () => {
    const html = `
      <!-- <meta property="og:title" content="Comment"> -->
      <script>const template = '<meta property="og:title" content="Script">';</script>
      <meta content="A > B" property="og:title">
      <link href=/icon.ico rel=icon>
    `;
    expect(parsePageMetadata(html, 'https://example.com/path').title).toBe('A > B');
    expect(parsePageMetadata(html, 'https://example.com/path').faviconUrl).toBe('https://example.com/icon.ico');
  });

  it('ignoresUnsafeIconsAndDoesNotThrowOnInvalidNumericEntities', () => {
    const metadata = parsePageMetadata('<title>Bad &#99999999; entity</title><link rel="icon" href="javascript:alert(1)">', 'https://example.com');
    expect(metadata.title).toBe('Bad � entity');
    expect(metadata.faviconUrl).toBeNull();
  });
});
