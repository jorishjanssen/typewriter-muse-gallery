import { config, llmEnabled } from '../config.js';
import type { DB } from '../db.js';
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
  db: DB,
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
  db: DB,
  source: SourceDef,
  opts: { extract?: (url: string) => Promise<Extracted> }
): Promise<RefreshStats['sources'][number]> {
  const markRun = db.prepare(
    `INSERT INTO source_state (source_key, last_run_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(source_key) DO UPDATE SET last_run_at = excluded.last_run_at`
  );
  markRun.run(source.key);

  let items: FeedItem[];
  try {
    items = await fetchFeed(db, source);
  } catch (err) {
    const message = (err as Error).message.slice(0, 300);
    db.prepare('UPDATE source_state SET last_error = ? WHERE source_key = ?').run(message, source.key);
    return { key: source.key, ok: false, newArticles: 0, error: message };
  }

  const exists = db.prepare('SELECT 1 FROM articles WHERE source_key = ? AND guid = ?');
  const fresh = items.filter((i) => !exists.get(source.key, i.guid));

  let inserted = 0;
  for (const item of fresh) {
    const extracted = await (opts.extract ?? extractArticle)(item.url);
    await ingestArticle(db, source, item, extracted);
    inserted++;
    if (!opts.extract) await sleep(config.scrape.perHostDelayMs);
  }

  db.prepare(
    `UPDATE source_state SET last_ok_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error = NULL,
       articles_total = (SELECT COUNT(*) FROM articles WHERE source_key = ?)
     WHERE source_key = ?`
  ).run(source.key, source.key);

  return { key: source.key, ok: true, newArticles: inserted };
}

/** Insert one article, enriching (LLM or fallback) and assigning a cluster. */
export async function ingestArticle(
  db: DB,
  source: SourceDef,
  item: FeedItem,
  extracted: Extracted
): Promise<number> {
  const text = extracted.contentText ?? item.excerpt ?? '';
  const candidates = recentClusters(db);

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
    clusterId = matchClusterByTitle(item.title, candidates) ?? createCluster(db, item.title);
  }
  touchCluster(db, clusterId);

  const res = db
    .prepare(
      `INSERT INTO articles
         (source_key, guid, url, title, author, published_at, excerpt, content_html, content_text,
          image_url, lang, category, summary, cluster_id, enriched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_key, guid) DO NOTHING`
    )
    .run(
      source.key,
      item.guid,
      item.url,
      item.title,
      extracted.author ?? item.author,
      item.publishedAt,
      item.excerpt,
      extracted.contentHtml,
      extracted.contentText,
      extracted.imageUrl ?? item.imageUrl,
      source.lang,
      category,
      summary,
      clusterId,
      summary ? new Date().toISOString() : null
    );
  return Number(res.lastInsertRowid);
}
