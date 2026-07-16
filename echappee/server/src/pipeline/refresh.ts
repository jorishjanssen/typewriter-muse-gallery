import { config, llmEnabled } from '../config.js';
import { nowIso, type Db } from '../db.js';
import { SOURCES, type SourceDef } from '../sources.js';
import {
  enrichArticle,
  generateWatchGuide,
  riderKey,
  setLlmModel,
  setLlmTaskModels,
  type RaceRef,
} from '../llm.js';
import { categorizeByKeywords } from './categorize.js';
import { createCluster, matchClusterByTitle, recentClusters, touchCluster } from './cluster.js';
import { extractArticle, htmlToText, sanitizeFragment, type Extracted } from './extract.js';
import { fetchFeed, userAgentFor, type FeedItem } from './fetchFeeds.js';
import { refreshClusterBriefs } from './clusterBriefs.js';
import { mergeDuplicateClusters } from './merge.js';

export interface RefreshStats {
  sources: { key: string; ok: boolean; newArticles: number; skipped: number; error?: string }[];
  totalNew: number;
  repaired: number;
  removed: number;
  backfilled: number;
  merged: number;
  clusterBriefs: number;
}

export async function linkRace(db: Db, articleId: number, race: RaceRef): Promise<void> {
  const raceKey = `${riderKey(race.name)} ${race.year}`;
  const stageLabel = race.stage ? `Stage ${race.stage}` : 'One-day race';
  const raceName = `${race.name} ${race.year}`;
  const rows = await db.query<{ id: number }>(
    `INSERT INTO races (race_key, race_name, stage_label, race_date) VALUES ($1, $2, $3, $4)
     ON CONFLICT (race_key, stage_label)
     DO UPDATE SET race_date = COALESCE(races.race_date, EXCLUDED.race_date)
     RETURNING id`,
    [raceKey, raceName, stageLabel, race.date]
  );
  const raceId = rows[0]?.id;
  if (raceId) {
    await db.query('UPDATE articles SET race_id = $1, race_kind = $2 WHERE id = $3', [
      raceId,
      race.kind,
      articleId,
    ]);
  }
}

export async function saveRiders(db: Db, articleId: number, riders: string[]): Promise<void> {
  for (const name of riders) {
    const key = riderKey(name);
    if (!key) continue;
    await db.query(
      `INSERT INTO article_riders (article_id, rider_key, rider_name) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [articleId, key, name.trim()]
    );
  }
}

/** True when extracted content is a real article rather than a video/podcast/teaser post. */
export function hasSubstantialText(extracted: Extracted): boolean {
  return (extracted.contentText?.length ?? 0) >= config.scrape.minFullTextChars;
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
  if (running)
    return { sources: [], totalNew: 0, repaired: 0, removed: 0, backfilled: 0, merged: 0, clusterBriefs: 0 };
  running = true;
  try {
    // The UI-selected models (settings table) win over env configuration.
    const modelSettings = await db.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key LIKE 'llm_model%'`
    );
    const setting = (key: string) => modelSettings.find((r) => r.key === key)?.value ?? null;
    setLlmModel(setting('llm_model'));
    setLlmTaskModels({
      enrich: setting('llm_model_enrich'),
      brief: setting('llm_model_brief'),
      merge: setting('llm_model_merge'),
      guide: setting('llm_model_guide'),
    });

    const stats: RefreshStats = {
      sources: [], totalNew: 0, repaired: 0, removed: 0, backfilled: 0, merged: 0, clusterBriefs: 0,
    };
    for (const source of SOURCES.filter((s) => s.enabled)) {
      const entry = await refreshSource(db, source, opts);
      stats.sources.push(entry);
      stats.totalNew += entry.newArticles;
      opts.onSource?.(entry);
    }
    // Real pipeline runs also retry extraction for stored articles that are
    // thin, repairing transient failures and removing posts that turn out to
    // have no article body at all (video/podcast/teaser posts). Skipped when
    // a fake extractor is injected (tests/seed).
    if (!opts.extract) {
      const cleanup = await repairOrRemoveThinArticles(db);
      stats.repaired = cleanup.repaired;
      stats.removed = cleanup.removed;
      if (llmEnabled()) {
        stats.backfilled = await backfillEnrichment(db);
        stats.merged = await mergeDuplicateClusters(db);
        // After merging, so freshly merged clusters get a combined brief now.
        stats.clusterBriefs = await refreshClusterBriefs(db);
        await generateWatchGuides(db);
      }
    }
    return stats;
  } finally {
    running = false;
  }
}

/**
 * Re-attempt full-text extraction for stored articles whose text is missing
 * or too short to be a real article. Successful retries are saved; posts
 * that still have no substantial text are deleted — they are video/podcast
 * or teaser posts, not articles. (If such a post is still in its source's
 * feed, ingest re-evaluates it next run and skips it there.)
 */
async function repairOrRemoveThinArticles(
  db: Db,
  limit = 10
): Promise<{ repaired: number; removed: number }> {
  const thin = await db.query<{ id: number; url: string; source_key: string }>(
    `SELECT id, url, source_key FROM articles
     WHERE content_text IS NULL OR LENGTH(content_text) < $1
     ORDER BY id DESC LIMIT $2`,
    [config.scrape.minFullTextChars, limit]
  );
  let repaired = 0;
  let removed = 0;
  for (const row of thin) {
    const source = SOURCES.find((s) => s.key === row.source_key);
    const extracted = await extractArticle(row.url, source ? userAgentFor(source) : undefined);
    if (hasSubstantialText(extracted)) {
      await db.query(
        `UPDATE articles SET content_html = $1, content_text = $2,
           image_url = COALESCE(image_url, $3)
         WHERE id = $4`,
        [extracted.contentHtml, extracted.contentText, extracted.imageUrl, row.id]
      );
      repaired++;
    } else {
      await db.query('DELETE FROM articles WHERE id = $1', [row.id]);
      removed++;
    }
    await sleep(config.scrape.perHostDelayMs);
  }
  return { repaired, removed };
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
    return { key: source.key, ok: false, newArticles: 0, skipped: 0, error: message };
  }

  let inserted = 0;
  let skipped = 0;
  for (const item of items) {
    const exists = await db.query('SELECT 1 FROM articles WHERE source_key = $1 AND guid = $2', [
      source.key,
      item.guid,
    ]);
    if (exists.length > 0) continue;
    const extracted = opts.extract
      ? await opts.extract(item.url)
      : await extractArticle(item.url, userAgentFor(source));
    const content = bestContent(extracted, item);
    // Posts without a real article body (video-only, podcasts, paywalled
    // teasers) are not ingested. Not persisting them also means a transient
    // extraction failure gets retried on the next run. Only enforced in real
    // pipeline runs — tests/seed inject their own extractor.
    if (!opts.extract && !hasSubstantialText(content)) {
      skipped++;
      continue;
    }
    await ingestArticle(db, source, item, content);
    inserted++;
    if (!opts.extract) await sleep(config.scrape.perHostDelayMs);
  }

  await db.query(
    `UPDATE source_state SET last_ok_at = $1, last_error = NULL,
       articles_total = (SELECT COUNT(*) FROM articles WHERE source_key = $2)
     WHERE source_key = $2`,
    [nowIso(), source.key]
  );

  return { key: source.key, ok: true, newArticles: inserted, skipped };
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
  let riders: string[] | null = null;
  let brief: string | null = null;
  let race: RaceRef | null = null;
  let importance: number | null = null;
  let quote: { text: string; who: string } | null = null;

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
      riders = enrichment.riders;
      brief = enrichment.brief;
      race = enrichment.race;
      importance = enrichment.importance;
      quote = enrichment.quote;
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
        content_text, image_url, lang, category, summary, cluster_id, enriched_at, riders_at, brief,
        importance, quote_text, quote_who)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
      riders !== null ? nowIso() : null,
      brief,
      importance,
      quote?.text ?? null,
      quote?.who ?? null,
    ]
  );
  const id = rows[0]?.id ?? 0;
  if (id > 0 && riders !== null) await saveRiders(db, id, riders);
  if (id > 0 && race) await linkRace(db, id, race);
  return id;
}

/**
 * Create or refresh spoiler-free watch guides for race days whose report
 * count grew since the guide was generated (bounded per run).
 */
async function generateWatchGuides(db: Db, limit = 3): Promise<void> {
  const pending = await db.query<{ id: number; race_name: string; stage_label: string; reports: number }>(
    `SELECT r.id, r.race_name, r.stage_label, COUNT(a.id)::int AS reports
     FROM races r JOIN articles a ON a.race_id = r.id AND a.race_kind = 'report'
     GROUP BY r.id, r.race_name, r.stage_label
     HAVING COUNT(a.id) > COALESCE((SELECT article_count FROM watch_guides w WHERE w.race_id = r.id), 0)
     ORDER BY MAX(a.published_at) DESC
     LIMIT $1`,
    [limit]
  );
  for (const race of pending) {
    const reports = await db.query<{ content_text: string | null }>(
      `SELECT content_text FROM articles
       WHERE race_id = $1 AND race_kind = 'report' AND content_text IS NOT NULL
       ORDER BY LENGTH(content_text) DESC LIMIT 4`,
      [race.id]
    );
    const texts = reports.map((r) => r.content_text!).filter(Boolean);
    if (!texts.length) continue;
    const guide = await generateWatchGuide(`${race.race_name} — ${race.stage_label}`, texts);
    if (!guide) continue;
    await db.query(
      `INSERT INTO watch_guides (race_id, generated_at, article_count, guide) VALUES ($1, $2, $3, $4)
       ON CONFLICT (race_id) DO UPDATE SET generated_at = EXCLUDED.generated_at,
         article_count = EXCLUDED.article_count, guide = EXCLUDED.guide`,
      [race.id, nowIso(), race.reports, JSON.stringify(guide)]
    );
  }
}

/**
 * Enrich stored articles that have no rider data yet (bounded per run):
 * extracts riders, and fills in summary/category for articles ingested
 * before the LLM key existed. Clustering is left untouched.
 */
async function backfillEnrichment(db: Db, limit = 25): Promise<number> {
  const rows = await db.query<{ id: number; title: string; content_text: string | null; lang: string }>(
    `SELECT id, title, content_text, lang FROM articles
     WHERE riders_at IS NULL OR brief IS NULL OR importance IS NULL ORDER BY published_at DESC LIMIT $1`,
    [limit]
  );
  let done = 0;
  for (const row of rows) {
    const enrichment = await enrichArticle({
      title: row.title,
      text: row.content_text ?? '',
      lang: row.lang,
      candidateClusters: [],
    });
    if (!enrichment) continue;
    await db.query(
      `UPDATE articles SET summary = COALESCE(summary, $1), category = $2,
         enriched_at = COALESCE(enriched_at, $3), riders_at = $3, brief = COALESCE(brief, $4),
         importance = $5, quote_text = COALESCE(quote_text, $6), quote_who = COALESCE(quote_who, $7)
       WHERE id = $8`,
      [
        enrichment.summary, enrichment.category, nowIso(), enrichment.brief,
        enrichment.importance, enrichment.quote?.text ?? null, enrichment.quote?.who ?? null, row.id,
      ]
    );
    await saveRiders(db, row.id, enrichment.riders);
    if (enrichment.race) await linkRace(db, row.id, enrichment.race);
    done++;
  }
  return done;
}
