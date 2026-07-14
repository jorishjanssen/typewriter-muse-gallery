import { config } from '../config.js';

// Loaded lazily: this library's dependency chain (sanitize-html requiring an
// ESM-only htmlparser2) crashes Vercel's function runtime at load time. The
// serverless API never extracts articles — only the scraper (GitHub Actions /
// local Node) does, and plain Node handles the chain fine.
let extractorPromise: Promise<typeof import('@extractus/article-extractor')> | null = null;
function getExtractor() {
  extractorPromise ??= import('@extractus/article-extractor');
  return extractorPromise;
}

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

/**
 * Light sanitation for publisher-supplied HTML fragments (feed content):
 * strip scripts/styles, inline event handlers and javascript: links before
 * the fragment is rendered in the reader.
 */
export function sanitizeFragment(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** Reader-mode extraction from an HTML string (fetched page or fixture). */
export async function extractArticleFromHtml(html: string, url: string): Promise<Extracted> {
  try {
    const { extractFromHtml } = await getExtractor();
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
export async function extractArticle(url: string, userAgent?: string): Promise<Extracted> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent ?? config.scrape.userAgent },
      signal: AbortSignal.timeout(config.scrape.fetchTimeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return EMPTY;
    const html = await res.text();
    return await extractArticleFromHtml(html, url);
  } catch {
    return EMPTY;
  }
}
