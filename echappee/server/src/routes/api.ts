import type { FastifyInstance } from 'fastify';
import type { DB } from '../db.js';
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
  content_text: string | null;
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

function getMutes(db: DB): Mute[] {
  return db.prepare('SELECT id, kind, value FROM mutes ORDER BY created_at DESC').all() as Mute[];
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
    hasFullText: row.content_text !== null && row.content_text.length > 200,
    read: row.read_at !== null,
  };
}

export function registerApi(app: FastifyInstance, db: DB): void {
  // ---- Feed: newest clusters, one card each --------------------------------
  app.get<{
    Querystring: { category?: string; source?: string; unread?: string; before?: string; limit?: string };
  }>('/api/feed', async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const mutes = getMutes(db);
    const mutedSources = new Set(mutes.filter((m) => m.kind === 'source').map((m) => m.value));
    const mutedCategories = new Set(mutes.filter((m) => m.kind === 'category').map((m) => m.value));
    const mutedTerms = mutes.filter((m) => m.kind === 'term').map((m) => m.value.toLowerCase());

    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.category) {
      where.push('category = ?');
      params.push(req.query.category);
    }
    if (req.query.source) {
      where.push('source_key = ?');
      params.push(req.query.source);
    }
    if (req.query.unread === '1') where.push('read_at IS NULL');
    if (req.query.before) {
      where.push('published_at < ?');
      params.push(req.query.before);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // Over-fetch article rows, then group into cluster cards until `limit`.
    const rows = db
      .prepare(
        `SELECT id, source_key, url, title, author, published_at, excerpt, content_text,
                image_url, lang, category, summary, cluster_id, read_at
         FROM articles ${whereSql}
         ORDER BY published_at DESC LIMIT ?`
      )
      .all(...params, limit * 5) as ArticleRow[];

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
        const lenA = a.content_text?.length ?? 0;
        const lenB = b.content_text?.length ?? 0;
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
    const row = db
      .prepare(
        `SELECT id, source_key, url, title, author, published_at, excerpt, content_html, content_text,
                image_url, lang, category, summary, cluster_id, read_at
         FROM articles WHERE id = ?`
      )
      .get(req.params.id) as (ArticleRow & { content_html: string | null }) | undefined;
    if (!row) return reply.code(404).send({ error: 'not found' });
    const siblings = db
      .prepare(
        `SELECT id, source_key, url, title, author, published_at, excerpt, content_text,
                image_url, lang, category, summary, cluster_id, read_at
         FROM articles WHERE cluster_id = ? AND id != ? ORDER BY published_at DESC`
      )
      .all(row.cluster_id, row.id) as ArticleRow[];
    return { ...articleCard(row), contentHtml: row.content_html, alternates: siblings.map(articleCard) };
  });

  // ---- Read state -----------------------------------------------------------
  app.post<{ Params: { id: string } }>('/api/articles/:id/read', async (req) => {
    db.prepare(
      `UPDATE articles SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND read_at IS NULL`
    ).run(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/articles/:id/unread', async (req) => {
    db.prepare('UPDATE articles SET read_at = NULL WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.post('/api/read-all', async () => {
    db.prepare(
      `UPDATE articles SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE read_at IS NULL`
    ).run();
    return { ok: true };
  });

  // ---- Mutes ----------------------------------------------------------------
  app.get('/api/mutes', async () => getMutes(db));

  app.post<{ Body: { kind: string; value: string } }>('/api/mutes', async (req, reply) => {
    const { kind, value } = req.body ?? {};
    if (!['term', 'source', 'category'].includes(kind) || !value?.trim()) {
      return reply.code(400).send({ error: 'kind must be term|source|category and value non-empty' });
    }
    db.prepare('INSERT OR IGNORE INTO mutes (kind, value) VALUES (?, ?)').run(kind, value.trim());
    return getMutes(db);
  });

  app.delete<{ Params: { id: string } }>('/api/mutes/:id', async (req) => {
    db.prepare('DELETE FROM mutes WHERE id = ?').run(req.params.id);
    return getMutes(db);
  });

  // ---- Sources health -------------------------------------------------------
  app.get('/api/sources', async () => {
    const states = db.prepare('SELECT * FROM source_state').all() as {
      source_key: string;
      working_feed_url: string | null;
      last_run_at: string | null;
      last_ok_at: string | null;
      last_error: string | null;
      articles_total: number;
    }[];
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
        articlesTotal: st?.articles_total ?? 0,
      };
    });
  });

  // ---- Status + manual refresh ----------------------------------------------
  app.get('/api/status', async () => {
    const counts = db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread FROM articles`
      )
      .get() as { total: number; unread: number | null };
    return {
      articles: counts.total,
      unread: counts.unread ?? 0,
      llm: { enabled: llmEnabled(), model: config.llm.model, baseUrl: config.llm.baseUrl },
      scrapeIntervalMinutes: config.scrape.intervalMinutes,
    };
  });

  app.post('/api/refresh', async () => {
    // Fire and forget; the UI polls /api/status for new counts.
    void refreshAll(db).catch((err) => app.log.error(err));
    return { started: true };
  });
}
