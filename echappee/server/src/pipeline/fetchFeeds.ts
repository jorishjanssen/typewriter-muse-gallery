import Parser from 'rss-parser';
import { config } from '../config.js';
import type { SourceDef } from '../sources.js';
import type { DB } from '../db.js';

export interface FeedItem {
  guid: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: string;
  excerpt: string | null;
  imageUrl: string | null;
}

const parser = new Parser({
  timeout: 20_000,
  headers: { 'User-Agent': config.scrape.userAgent, Accept: 'application/rss+xml, application/xml, text/xml' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

function itemImage(item: Record<string, unknown>): string | null {
  const enc = item.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && (!enc.type || enc.type.startsWith('image/'))) return enc.url;
  const media = item.mediaContent as { $?: { url?: string } }[] | undefined;
  const mediaUrl = media?.find((m) => m.$?.url)?.$?.url;
  if (mediaUrl) return mediaUrl;
  const thumb = item.mediaThumbnail as { $?: { url?: string } } | undefined;
  return thumb?.$?.url ?? null;
}

function toItem(raw: Parser.Item & Record<string, unknown>): FeedItem | null {
  const url = raw.link?.trim();
  const title = raw.title?.trim();
  if (!url || !title) return null;
  const published = raw.isoDate ?? (raw.pubDate ? new Date(raw.pubDate).toISOString() : null);
  return {
    guid: (raw.guid as string | undefined)?.trim() || url,
    url,
    title,
    author: raw.creator?.trim() || (raw as { author?: string }).author?.trim() || null,
    publishedAt: published ?? new Date().toISOString(),
    excerpt: raw.contentSnippet?.trim().slice(0, 500) || null,
    imageUrl: itemImage(raw),
  };
}

/**
 * Parse a source's feed, trying each configured URL until one works.
 * The first working URL is remembered in source_state and tried first
 * on subsequent runs.
 */
export async function fetchFeed(db: DB, source: SourceDef): Promise<FeedItem[]> {
  const remembered = db
    .prepare('SELECT working_feed_url FROM source_state WHERE source_key = ?')
    .get(source.key) as { working_feed_url: string | null } | undefined;

  const urls = [...new Set([remembered?.working_feed_url, ...source.feedUrls].filter(Boolean))] as string[];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url);
      const items = (feed.items ?? [])
        .map((i) => toItem(i as unknown as Parser.Item & Record<string, unknown>))
        .filter((i): i is FeedItem => i !== null)
        .slice(0, config.scrape.maxItemsPerSourcePerRun);
      db.prepare(
        `INSERT INTO source_state (source_key, working_feed_url) VALUES (?, ?)
         ON CONFLICT(source_key) DO UPDATE SET working_feed_url = excluded.working_feed_url`
      ).run(source.key, url);
      return items;
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error(`no feed URLs configured for ${source.key}`);
}
