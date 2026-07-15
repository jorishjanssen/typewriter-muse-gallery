import type { FastifyInstance } from 'fastify';
import { nowIso, type Db } from '../db.js';
import { SOURCES } from '../sources.js';
import { config, llmEnabled } from '../config.js';
import { refreshAll } from '../pipeline/refresh.js';

interface ArticleRow {
  id: number;
  source_key: string;
  url: string;
  title: string;
  author: string | null;
  published_at: string;
  excerpt: string | null;
  /** Byte length of the extracted text — fetched instead of the text itself. */
  content_len: number | null;
  image_url: string | null;
  lang: string;
  category: string;
  summary: string | null;
  brief: string | null;
  importance: number | null;
  cluster_id: number;
  read_at: string | null;
}

interface Mute {
  id: number;
  kind: 'term' | 'source' | 'category';
  value: string;
}

function getMutes(db: Db): Promise<Mute[]> {
  return db.query<Mute>('SELECT id, kind, value FROM mutes ORDER BY created_at DESC');
}

function articleCard(row: ArticleRow) {
  return {
    id: row.id,
    sourceKey: row.source_key,
    sourceName: SOURCES.find((s) => s.key === row.source_key)?.name ?? row.source_key,
    url: row.url,
    title: row.title,
    author: row.author,
    publishedAt: row.published_at,
    excerpt: row.excerpt,
    imageUrl: row.image_url,
    lang: row.lang,
    category: row.category,
    summary: row.summary,
    brief: row.brief,
    importance: row.importance ?? 2,
    hasFullText: (row.content_len ?? 0) > 200,
    // ~6 chars/word, 220 wpm.
    readingMinutes:
      (row.content_len ?? 0) > 200 ? Math.max(1, Math.round((row.content_len ?? 0) / 6 / 220)) : null,
    read: row.read_at !== null,
  };
}

// Deliberately NOT content_text: the feed only needs its length, and pulling
// full article bodies for 100+ rows per request dominated response time.
const ARTICLE_COLS = `id, source_key, url, title, author, published_at, excerpt,
                LENGTH(content_text) AS content_len,
                image_url, lang, category, summary, brief, importance, cluster_id, read_at`;

export function registerApi(app: FastifyInstance, db: Db): void {
  // ---- Feed: newest clusters, one card each --------------------------------
  app.get<{
    Querystring: {
      category?: string;
      source?: string;
      rider?: string;
      race?: string;
      unread?: string;
      before?: string;
      limit?: string;
    };
  }>('/api/feed', async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const mutes = await getMutes(db);
    const mutedSources = new Set(mutes.filter((m) => m.kind === 'source').map((m) => m.value));
    const mutedCategories = new Set(mutes.filter((m) => m.kind === 'category').map((m) => m.value));
    const mutedTerms = mutes.filter((m) => m.kind === 'term').map((m) => m.value.toLowerCase());

    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.category) {
      params.push(req.query.category);
      where.push(`category = $${params.length}`);
    }
    if (req.query.source) {
      params.push(req.query.source);
      where.push(`source_key = $${params.length}`);
    }
    if (req.query.rider) {
      params.push(req.query.rider);
      where.push(`id IN (SELECT article_id FROM article_riders WHERE rider_key = $${params.length})`);
    }
    if (req.query.race) {
      params.push(Number(req.query.race));
      where.push(`race_id = $${params.length}`);
    }
    if (req.query.unread === '1') where.push('read_at IS NULL');
    if (req.query.before) {
      params.push(req.query.before);
      where.push(`published_at < $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // Over-fetch article rows, then group into cluster cards until `limit`.
    params.push(limit * 5);
    const rows = await db.query<ArticleRow>(
      `SELECT ${ARTICLE_COLS} FROM articles ${whereSql}
       ORDER BY published_at DESC LIMIT $${params.length}`,
      params
    );

    const visible = rows.filter((r) => {
      if (mutedSources.has(r.source_key) || mutedCategories.has(r.category)) return false;
      const hay = `${r.title} ${r.summary ?? ''} ${r.excerpt ?? ''}`.toLowerCase();
      return !mutedTerms.some((t) => hay.includes(t));
    });

    const clusters = new Map<number, ArticleRow[]>();
    for (const row of visible) {
      const group = clusters.get(row.cluster_id);
      if (group) group.push(row);
      else clusters.set(row.cluster_id, [row]);
    }

    // Merged multi-source briefs for the clusters on this page.
    const clusterIds = [...clusters.keys()];
    const clusterBriefs = new Map<number, string>();
    if (clusterIds.length > 0) {
      const briefRows = await db.query<{ id: number; brief: string | null }>(
        `SELECT id, brief FROM clusters
         WHERE brief IS NOT NULL AND id IN (${clusterIds.map((_, i) => `$${i + 1}`).join(',')})`,
        clusterIds
      );
      for (const r of briefRows) if (r.brief) clusterBriefs.set(r.id, r.brief);
    }

    const cards = [];
    let lastPublished: string | null = null;
    for (const group of clusters.values()) {
      if (cards.length >= limit) break;
      // Best article: full text wins, then longest text, then newest.
      const best = [...group].sort((a, b) => {
        const lenA = a.content_len ?? 0;
        const lenB = b.content_len ?? 0;
        return lenB - lenA || b.published_at.localeCompare(a.published_at);
      })[0];
      cards.push({
        clusterId: best.cluster_id,
        article: articleCard(best),
        alternates: group.filter((r) => r.id !== best.id).map(articleCard),
        // Only meaningful for multi-source cards; a lone visible article
        // (e.g. after muting a source) falls back to its own brief.
        clusterBrief: group.length > 1 ? (clusterBriefs.get(best.cluster_id) ?? null) : null,
        read: group.every((r) => r.read_at !== null),
      });
      lastPublished = group[group.length - 1].published_at;
    }

    const exhausted = rows.length < limit * 5 && cards.length < limit;
    return { cards, nextBefore: exhausted ? null : lastPublished };
  });

  // ---- Single article (reader view) ----------------------------------------
  app.get<{ Params: { id: string } }>('/api/articles/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(404).send({ error: 'not found' });
    const row = (
      await db.query<ArticleRow & { content_html: string | null }>(
        `SELECT ${ARTICLE_COLS}, content_html FROM articles WHERE id = $1`,
        [id]
      )
    )[0];
    if (!row) return reply.code(404).send({ error: 'not found' });
    const siblings = await db.query<ArticleRow>(
      `SELECT ${ARTICLE_COLS} FROM articles
       WHERE cluster_id = $1 AND id != $2 ORDER BY published_at DESC`,
      [row.cluster_id, row.id]
    );
    const riders = await db.query<{ key: string; name: string }>(
      'SELECT rider_key AS key, rider_name AS name FROM article_riders WHERE article_id = $1',
      [row.id]
    );
    return {
      ...articleCard(row),
      contentHtml: row.content_html,
      alternates: siblings.map(articleCard),
      riders,
    };
  });

  // ---- Riders ----------------------------------------------------------------
  app.get('/api/riders', async () => {
    return db.query<{ key: string; name: string; articles: number }>(
      `SELECT rider_key AS key,
              mode() WITHIN GROUP (ORDER BY rider_name) AS name,
              COUNT(*)::int AS articles
       FROM article_riders
       GROUP BY rider_key
       ORDER BY articles DESC, name ASC
       LIMIT 300`
    );
  });

  // ---- Catch-up digest: triage the unread pile in one glance -----------------
  app.get('/api/catchup', async () => {
    const rows = await db.query<ArticleRow>(
      `SELECT ${ARTICLE_COLS} FROM articles WHERE read_at IS NULL
       ORDER BY published_at DESC LIMIT 300`
    );
    const clusters = new Map<number, ArticleRow[]>();
    for (const row of rows) {
      const group = clusters.get(row.cluster_id);
      if (group) group.push(row);
      else clusters.set(row.cluster_id, [row]);
    }
    const scored = [...clusters.values()].map((group) => {
      const best = [...group].sort(
        (a, b) => (b.content_len ?? 0) - (a.content_len ?? 0)
      )[0];
      const maxImportance = Math.max(...group.map((a) => a.importance ?? 2));
      // Multi-source coverage is itself an importance signal.
      const score = Math.min(5, maxImportance + (group.length >= 3 ? 1 : 0));
      return { clusterId: best.cluster_id, score, sources: group.length, article: articleCard(best) };
    });
    const big = scored
      .filter((c) => c.score >= 4)
      .sort((a, b) => b.score - a.score || b.article.publishedAt.localeCompare(a.article.publishedAt))
      .slice(0, 5);
    const oldest = rows.length ? rows[rows.length - 1].published_at : null;
    return { unreadStories: clusters.size, big, oldestUnread: oldest };
  });

  // ---- Races (spoiler-safe: no article data in these responses) --------------
  app.get('/api/races', async () => {
    return db.query(
      `SELECT r.id, r.race_key AS "raceKey", r.race_name AS "raceName",
              r.stage_label AS "stageLabel", r.race_date AS "raceDate",
              COUNT(a.id)::int AS articles,
              EXISTS (SELECT 1 FROM watch_guides w WHERE w.race_id = r.id) AS "hasGuide"
       FROM races r LEFT JOIN articles a ON a.race_id = r.id
       GROUP BY r.id
       HAVING COUNT(a.id) > 0
       ORDER BY r.race_date DESC NULLS LAST, r.race_name ASC, r.stage_label DESC`
    );
  });

  app.get<{ Params: { id: string } }>('/api/races/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const race = (
      await db.query<{ id: number; race_name: string; stage_label: string; race_date: string | null }>(
        'SELECT id, race_name, stage_label, race_date FROM races WHERE id = $1',
        [id]
      )
    )[0];
    if (!race) return reply.code(404).send({ error: 'not found' });
    const guideRow = (
      await db.query<{ guide: string; generated_at: string }>(
        'SELECT guide, generated_at FROM watch_guides WHERE race_id = $1',
        [id]
      )
    )[0];
    const counts = (
      await db.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM articles WHERE race_id = $1',
        [id]
      )
    )[0];
    return {
      id: race.id,
      raceName: race.race_name,
      stageLabel: race.stage_label,
      raceDate: race.race_date,
      articleCount: counts.total,
      guide: guideRow ? JSON.parse(guideRow.guide) : null,
      guideGeneratedAt: guideRow?.generated_at ?? null,
    };
  });

  // Feed banner: the most recently generated watch guide, if it's fresh.
  // Spoiler-safe — only the race identity, never guide content or articles.
  app.get('/api/race-banner', async () => {
    const cutoff = new Date(Date.now() - 36 * 3600_000).toISOString();
    const row = (
      await db.query<{ id: number; race_name: string; stage_label: string; generated_at: string }>(
        `SELECT r.id, r.race_name, r.stage_label, w.generated_at
         FROM watch_guides w JOIN races r ON r.id = w.race_id
         WHERE w.generated_at > $1
         ORDER BY w.generated_at DESC LIMIT 1`,
        [cutoff]
      )
    )[0];
    if (!row) return { raceId: null };
    return {
      raceId: row.id,
      raceName: row.race_name,
      stageLabel: row.stage_label,
      generatedAt: row.generated_at,
    };
  });

  // ---- Read state -----------------------------------------------------------
  // Engagement is tracked alongside: this endpoint fires when the reader
  // opens an article, so it also stamps opened_at ("actually read").
  app.post<{ Params: { id: string } }>('/api/articles/:id/read', async (req) => {
    const now = nowIso();
    await db.query(
      `UPDATE articles SET read_at = COALESCE(read_at, $1), opened_at = COALESCE(opened_at, $1)
       WHERE id = $2`,
      [now, Number(req.params.id)]
    );
    return { ok: true };
  });

  // "Keep unread" retracts the read state but not the fact it was opened.
  app.post<{ Params: { id: string } }>('/api/articles/:id/unread', async (req) => {
    await db.query('UPDATE articles SET read_at = NULL, seen_at = NULL WHERE id = $1', [
      Number(req.params.id),
    ]);
    return { ok: true };
  });

  // Cluster-level read state: a feed card represents a whole story, so
  // swiping it away must cover the alternates too — otherwise the story
  // reappears via its other sources in the unread view. This is the
  // triage path (swipe / scroll-past / action sheet), so it also stamps
  // seen_at ("dismissed without opening") on articles not opened before.
  app.post<{ Params: { id: string } }>('/api/clusters/:id/read', async (req) => {
    const now = nowIso();
    await db.query(
      `UPDATE articles SET read_at = COALESCE(read_at, $1),
         seen_at = CASE WHEN opened_at IS NULL THEN COALESCE(seen_at, $1) ELSE seen_at END
       WHERE cluster_id = $2`,
      [now, Number(req.params.id)]
    );
    return { ok: true };
  });

  // Undo: retract both the read state and the skip judgment.
  app.post<{ Params: { id: string } }>('/api/clusters/:id/unread', async (req) => {
    await db.query('UPDATE articles SET read_at = NULL, seen_at = NULL WHERE cluster_id = $1', [
      Number(req.params.id),
    ]);
    return { ok: true };
  });

  app.post('/api/read-all', async () => {
    await db.query('UPDATE articles SET read_at = $1 WHERE read_at IS NULL', [nowIso()]);
    return { ok: true };
  });

  // ---- Mutes ----------------------------------------------------------------
  app.get('/api/mutes', async () => getMutes(db));

  app.post<{ Body: { kind: string; value: string } }>('/api/mutes', async (req, reply) => {
    const { kind, value } = req.body ?? {};
    if (!['term', 'source', 'category'].includes(kind) || !value?.trim()) {
      return reply.code(400).send({ error: 'kind must be term|source|category and value non-empty' });
    }
    await db.query(
      'INSERT INTO mutes (kind, value, created_at) VALUES ($1, $2, $3) ON CONFLICT (kind, value) DO NOTHING',
      [kind, value.trim(), nowIso()]
    );
    return getMutes(db);
  });

  app.delete<{ Params: { id: string } }>('/api/mutes/:id', async (req) => {
    await db.query('DELETE FROM mutes WHERE id = $1', [Number(req.params.id)]);
    return getMutes(db);
  });

  // ---- Sources health -------------------------------------------------------
  app.get('/api/sources', async () => {
    const states = await db.query<{
      source_key: string;
      working_feed_url: string | null;
      last_run_at: string | null;
      last_ok_at: string | null;
      last_error: string | null;
      articles_total: number;
    }>('SELECT * FROM source_state');
    // Engagement per source: of the articles you triaged (opened or
    // dismissed), how many did you actually open? Bulk "mark all read"
    // stamps neither, so it doesn't skew the rate.
    const engagement = await db.query<{ source_key: string; opened: number; skipped: number }>(
      `SELECT source_key,
              SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END)::int AS opened,
              SUM(CASE WHEN opened_at IS NULL AND seen_at IS NOT NULL THEN 1 ELSE 0 END)::int AS skipped
       FROM articles GROUP BY source_key`
    );
    return SOURCES.map((s) => {
      const st = states.find((x) => x.source_key === s.key);
      const eng = engagement.find((x) => x.source_key === s.key);
      const opened = Number(eng?.opened ?? 0);
      const skipped = Number(eng?.skipped ?? 0);
      return {
        key: s.key,
        name: s.name,
        homepage: s.homepage,
        lang: s.lang,
        enabled: s.enabled,
        feedUrl: st?.working_feed_url ?? s.feedUrls[0],
        lastRunAt: st?.last_run_at ?? null,
        lastOkAt: st?.last_ok_at ?? null,
        lastError: st?.last_error ?? null,
        articlesTotal: Number(st?.articles_total ?? 0),
        opened,
        skipped,
        readPct: opened + skipped > 0 ? Math.round((opened / (opened + skipped)) * 100) : null,
      };
    });
  });

  // ---- LLM model setting ------------------------------------------------------
  const getModelSetting = async (): Promise<string | null> => {
    const rows = await db.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'llm_model'`
    );
    return rows[0]?.value ?? null;
  };

  app.get('/api/settings/llm', async () => {
    const custom = await getModelSetting();
    return {
      model: custom ?? config.llm.model,
      defaultModel: config.llm.model,
      custom,
    };
  });

  app.put<{ Body: { model?: string } }>('/api/settings/llm', async (req, reply) => {
    const model = (req.body?.model ?? '').trim();
    if (model.length > 100 || (model && !/^[\w./:-]+$/.test(model))) {
      return reply.code(400).send({ error: 'invalid model id' });
    }
    if (model) {
      await db.query(
        `INSERT INTO settings (key, value) VALUES ('llm_model', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [model]
      );
    } else {
      await db.query(`DELETE FROM settings WHERE key = 'llm_model'`);
    }
    const custom = await getModelSetting();
    return { model: custom ?? config.llm.model, defaultModel: config.llm.model, custom };
  });

  // ---- Status + manual refresh ----------------------------------------------
  app.get('/api/status', async () => {
    const counts = (
      await db.query<{ total: number; unread: number }>(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END), 0)::int AS unread
         FROM articles`
      )
    )[0];
    const customModel = await getModelSetting();
    return {
      articles: counts.total,
      unread: counts.unread,
      llm: {
        enabled: llmEnabled(),
        model: customModel ?? config.llm.model,
        baseUrl: config.llm.baseUrl,
      },
      scrapeIntervalMinutes: config.scrape.intervalMinutes,
      managedScraper: Boolean(process.env.VERCEL),
    };
  });

  app.post('/api/refresh', async () => {
    // On Vercel the scraper runs as a scheduled GitHub Actions workflow —
    // a serverless function would hit time limits long before finishing.
    if (process.env.VERCEL) return { started: false, managed: true };
    void refreshAll(db).catch((err) => app.log.error(err));
    return { started: true };
  });
}
