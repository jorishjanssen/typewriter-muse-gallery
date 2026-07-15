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
    hasFullText: (row.content_len ?? 0) > 200,
    read: row.read_at !== null,
  };
}

// Deliberately NOT content_text: the feed only needs its length, and pulling
// full article bodies for 100+ rows per request dominated response time.
const ARTICLE_COLS = `id, source_key, url, title, author, published_at, excerpt,
                LENGTH(content_text) AS content_len,
                image_url, lang, category, summary, cluster_id, read_at`;

export function registerApi(app: FastifyInstance, db: Db): void {
  // ---- Feed: newest clusters, one card each --------------------------------
  app.get<{
    Querystring: { category?: string; source?: string; unread?: string; before?: string; limit?: string };
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
    return { ...articleCard(row), contentHtml: row.content_html, alternates: siblings.map(articleCard) };
  });

  // ---- Read state -----------------------------------------------------------
  app.post<{ Params: { id: string } }>('/api/articles/:id/read', async (req) => {
    await db.query('UPDATE articles SET read_at = $1 WHERE id = $2 AND read_at IS NULL', [
      nowIso(),
      Number(req.params.id),
    ]);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/articles/:id/unread', async (req) => {
    await db.query('UPDATE articles SET read_at = NULL WHERE id = $1', [Number(req.params.id)]);
    return { ok: true };
  });

  // Cluster-level read state: a feed card represents a whole story, so
  // swiping it away must cover the alternates too — otherwise the story
  // reappears via its other sources in the unread view.
  app.post<{ Params: { id: string } }>('/api/clusters/:id/read', async (req) => {
    await db.query('UPDATE articles SET read_at = $1 WHERE cluster_id = $2 AND read_at IS NULL', [
      nowIso(),
      Number(req.params.id),
    ]);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/clusters/:id/unread', async (req) => {
    await db.query('UPDATE articles SET read_at = NULL WHERE cluster_id = $1', [
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
    return SOURCES.map((s) => {
      const st = states.find((x) => x.source_key === s.key);
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
      };
    });
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
    return {
      articles: counts.total,
      unread: counts.unread,
      llm: { enabled: llmEnabled(), model: config.llm.model, baseUrl: config.llm.baseUrl },
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
