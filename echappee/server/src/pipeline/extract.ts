import { extractFromHtml } from '@extractus/article-extractor';
import { config } from '../config.js';

export interface Extracted {
  contentHtml: string | null;
  contentText: string | null;
  imageUrl: string | null;
  author: string | null;
}

const EMPTY: Extracted = { contentHtml: null, contentText: null, imageUrl: null, author: null };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Reader-mode extraction from an HTML string (fetched page or fixture). */
export async function extractArticleFromHtml(html: string, url: string): Promise<Extracted> {
  try {
    const article = await extractFromHtml(html, url);
    if (!article?.content) return EMPTY;
    return {
      contentHtml: article.content,
      contentText: htmlToText(article.content),
      imageUrl: article.image || null,
      author: article.author || null,
    };
  } catch {
    return EMPTY;
  }
}

/** Fetch a page politely and run reader-mode extraction on it. */
export async function extractArticle(url: string): Promise<Extracted> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.scrape.userAgent },
      signal: AbortSignal.timeout(25_000),
      redirect: 'follow',
    });
    if (!res.ok) return EMPTY;
    const html = await res.text();
    return await extractArticleFromHtml(html, url);
  } catch {
    return EMPTY;
  }
}
