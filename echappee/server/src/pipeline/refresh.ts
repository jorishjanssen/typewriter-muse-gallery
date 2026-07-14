import { config, llmEnabled } from '../config.js';
import { nowIso, type Db } from '../db.js';
import { SOURCES, type SourceDef } from '../sources.js';
import { enrichArticle } from '../llm.js';
import { categorizeByKeywords } from './categorize.js';
import { createCluster, matchClusterByTitle, recentClusters, touchCluster } from './cluster.js';
import { extractArticle, htmlToText, sanitizeFragment, type Extracted } from './extract.js';
import { fetchFeed, userAgentFor, type FeedItem } from './fetchFeeds.js';

export interface RefreshStats {
  sources: { key: string; ok: boolean; newArticles: number; error?: string }[];
  totalNew: number;
  repaired: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running = false;

/** Full pipeline run over all enabled sources. Serialized: overlapping calls no-op. */
export async function refreshAll(
  db: Db,
  opts: {
    extract?: (url: string) => Promise<Extracted>;
    onSource?: (entry: RefreshStats['sources'][number]) => void;
  } = {}
): Promise<RefreshStats> {
  if (running) return { sources: [], totalNew: 0, repaired: 0 };
  running = true;
  try {
    const stats: RefreshStats = { sources: [], totalNew: 0, repaired: 0 };
    for (const source of SOURCES.filter((s) => s.enabled)) {
      const entry = await refreshSource(db, source, opts);
      stats.sources.push(entry);
      stats.totalNew += entry.newArticles;
      opts.onSource?.(entry);
    }
    // Real pipeline runs also retry extraction for recent articles that came
    // through thin (consent walls, transient blocks). Skipped when a fake
    // extractor is injected (tests/seed).
    if (!opts.extract) stats.repaired = await repairThinArticles(db);
    return stats;
  } finally {
    running = false;
  }
}

/**
 * Re-attempt full-text extraction for recent articles whose stored text is
 * missing or too short to be a real article. Bounded per run so it heals
 * gradually without slowing the scrape.
 */
async function repairThinArticles(db: Db, limit = 10): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
  const thin = await db.query<{ id: number; url: string; source_key: string }>(
    `SELECT id, url, source_key FROM articles
     WHERE (content_text IS NULL OR LENGTH(content_text) < 200) AND fetched_at >= $1
     ORDER BY id DESC LIMIT $2`,
    [cutoff, limit]
  );
  let repaired = 0;
  for (const row of thin) {
    const source = SOURCES.find((s) => s.key === row.source_key);
    const extracted = await extractArticle(row.url, source ? userAgentFor(source) : undefined);
    if ((extracted.contentText?.length ?? 0) >= 200) {
      await db.query(
        `UPDATE articles SET content_html = $1, content_text = $2,
           image_url = COALESCE(image_url, $3)
         WHERE id = $4`,
        [extracted.contentHtml, extracted.contentText, extracted.imageUrl, row.id]
      );
      repaired++;
    }
    await sleep(config.scrape.perHostDelayMs);
  }
  return repaired;
}

async function refreshSource(
  db: Db,
  source: SourceDef,
  opts: { extract?: (url: string) => Promise<Extracted> }
): Promise<RefreshStats['sources'][number]> {
  await db.query(
    `INSERT INTO source_state (source_key, last_run_at) VALUES ($1, $2)
     ON CONFLICT (source_key) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`,
    [source.key, nowIso()]
  );

  let items: FeedItem[];
  try {
    items = await fetchFeed(db, source);
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    await db.query('UPDATE source_state SET last_error = $1 WHERE source_key = $2', [
      message,
      source.key,
    ]);
    return { key: source.key, ok: false, newArticles: 0, error: message };
  }

  let inserted = 0;
  for (const item of items) {
    const exists = await db.query('SELECT 1 FROM articles WHERE source_key = $1 AND guid = $2', [
      source.key,
      item.guid,
    ]);
    if (exists.length > 0) continue;
    const extracted = opts.extract
      ? await opts.extract(item.url)
      : await extractArticle(item.url, userAgentFor(source));
    await ingestArticle(db, source, item, bestContent(extracted, item));
    inserted++;
    if (!opts.extract) await sleep(config.scrape.perHostDelayMs);
  }

  await db.query(
    `UPDATE source_state SET last_ok_at = $1, last_error = NULL,
       articles_total = (SELECT COUNT(*) FROM articles WHERE source_key = $2)
     WHERE source_key = $2`,
    [nowIso(), source.key]
  );

  return { key: source.key, ok: true, newArticles: inserted };
}

/**
 * Prefer whichever content is richer: reader-mode page extraction or the
 * full article HTML some feeds ship (WordPress content:encoded — e.g.
 * WielerFlits). Page extraction can fail on consent walls or unusual
 * layouts; the feed body is then the better source.
 */
export function bestContent(extracted: Extracted, item: FeedItem): Extracted {
  if (!item.contentHtml) return extracted;
  const feedText = htmlToText(item.contentHtml);
  const pageLen = extracted.contentText?.length ?? 0;
  if (feedText.length <= Math.max(pageLen, 200)) return extracted;
  return {
    contentHtml: sanitizeFragment(item.contentHtml),
    contentText: feedText,
    imageUrl: extracted.imageUrl,
    author: extracted.author,
  };
}

/** Insert one article, enriching (LLM or fallback) and assigning a cluster. */
export async function ingestArticle(
  db: Db,
  source: SourceDef,
  item: FeedItem,
  extracted: Extracted
): Promise<number> {
  const text = extracted.contentText ?? item.excerpt ?? '';
  const candidates = await recentClusters(db);

  let summary: string | null = null;
  let category = categorizeByKeywords(item.title, text, source.defaultCategory);
  let clusterId: number | null = null;

  if (llmEnabled()) {
    const enrichment = await enrichArticle({
      title: item.title,
      text,
      lang: source.lang,
      candidateClusters: candidates,
    });
    if (enrichment) {
      summary = enrichment.summary;
      category = enrichment.category;
      if (enrichment.clusterMatch !== null) clusterId = candidates[enrichment.clusterMatch].id;
    }
  }
  if (clusterId === null) {
    clusterId = matchClusterByTitle(item.title, candidates) ?? (await createCluster(db, item.title));
  }
  await touchCluster(db, clusterId);

  const rows = await db.query<{ id: number }>(
    `INSERT INTO articles
       (source_key, guid, url, title, author, published_at, fetched_at, excerpt, content_html,
        content_text, image_url, lang, category, summary, cluster_id, enriched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (source_key, guid) DO NOTHING
     RETURNING id`,
    [
      source.key,
      item.guid,
      item.url,
      item.title,
      extracted.author ?? item.author,
      item.publishedAt,
      nowIso(),
      item.excerpt,
      extracted.contentHtml,
      extracted.contentText,
      extracted.imageUrl ?? item.imageUrl,
      source.lang,
      category,
      summary,
      clusterId,
      summary ? nowIso() : null,
    ]
  );
  return rows[0]?.id ?? 0;
}
