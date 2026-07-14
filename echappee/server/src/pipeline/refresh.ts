import { config, llmEnabled } from '../config.js';
import { nowIso, type Db } from '../db.js';
import { SOURCES, type SourceDef } from '../sources.js';
import { enrichArticle } from '../llm.js';
import { categorizeByKeywords } from './categorize.js';
import { createCluster, matchClusterByTitle, recentClusters, touchCluster } from './cluster.js';
import { extractArticle, type Extracted } from './extract.js';
import { fetchFeed, type FeedItem } from './fetchFeeds.js';

export interface RefreshStats {
  sources: { key: string; ok: boolean; newArticles: number; error?: string }[];
  totalNew: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running = false;

/** Full pipeline run over all enabled sources. Serialized: overlapping calls no-op. */
export async function refreshAll(
  db: Db,
  opts: { extract?: (url: string) => Promise<Extracted> } = {}
): Promise<RefreshStats> {
  if (running) return { sources: [], totalNew: 0 };
  running = true;
  try {
    const stats: RefreshStats = { sources: [], totalNew: 0 };
    for (const source of SOURCES.filter((s) => s.enabled)) {
      const entry = await refreshSource(db, source, opts);
      stats.sources.push(entry);
      stats.totalNew += entry.newArticles;
    }
    return stats;
  } finally {
    running = false;
  }
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
    const extracted = await (opts.extract ?? extractArticle)(item.url);
    await ingestArticle(db, source, item, extracted);
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
