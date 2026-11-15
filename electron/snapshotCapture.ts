import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { fetchPageHtml } from './pageMetadata';

export const SNAPSHOT_HTML_LIMIT = 2_000_000;
export const SNAPSHOT_MARKDOWN_LIMIT = 400_000;

/** Extracts the readable article and converts it to Markdown; null when nothing readable exists. */
export function htmlToMarkdown(html: string, pageUrl: string): { title: string; markdown: string } | null {
  try {
    const dom = new JSDOM(html, { url: pageUrl });
    const documentTitle = dom.window.document.title;
    const article = new Readability(dom.window.document).parse();
    dom.window.close();
    if (!article?.content) return null;

    const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
      .turndown(article.content)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, SNAPSHOT_MARKDOWN_LIMIT);
    if (!markdown) return null;

    const title = String(article.title || documentTitle || '').trim().slice(0, 300) || pageUrl;
    return { title, markdown };
  } catch {
    return null;
  }
}

export interface CapturedSnapshot {
  sourceUrl: string;
  title: string;
  markdown: string;
}

/** Fetches a page once and returns its readable text; never throws for bad pages. */
export async function captureSnapshotDocument(rawUrl: string): Promise<CapturedSnapshot | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const page = await fetchPageHtml(rawUrl, controller.signal, SNAPSHOT_HTML_LIMIT);
    if (!page) return null;
    const converted = htmlToMarkdown(page.html, page.finalUrl);
    return converted ? { sourceUrl: page.finalUrl, ...converted } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
