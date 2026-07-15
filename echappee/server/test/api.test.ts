import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryDb, type Db } from '../src/db.js';
import { registerApi } from '../src/routes/api.js';
import { ingestArticle } from '../src/pipeline/refresh.js';
import { getSource } from '../src/sources.js';

let app: ReturnType<typeof Fastify>;
let db: Db;

const extracted = {
  contentHtml: '<p>' + 'long body text '.repeat(30) + '</p>',
  contentText: 'long body text '.repeat(30),
  imageUrl: null,
  author: null,
};

beforeAll(async () => {
  db = await createMemoryDb();
  const cn = getSource('cyclingnews')!;
  const wf = getSource('wielerflits')!;
  const br = getSource('bikeradar')!;

  await ingestArticle(db, cn, {
    guid: 'g1', url: 'https://example.com/g1',
    title: 'Pogacar storms to solo victory at Fleche Wallonne on the Mur de Huy',
    author: 'A', publishedAt: '2026-07-14T08:00:00.000Z', excerpt: 'exc', imageUrl: null,
  }, extracted);
  await ingestArticle(db, wf, {
    guid: 'g2', url: 'https://example.com/g2',
    title: 'Pogacar wins solo at Fleche Wallonne after attack on Mur de Huy',
    author: null, publishedAt: '2026-07-14T08:30:00.000Z', excerpt: null, imageUrl: null,
  }, { ...extracted, contentText: 'short' });
  await ingestArticle(db, br, {
    guid: 'g3', url: 'https://example.com/g3',
    title: 'First ride review: new carbon gravel racer',
    author: null, publishedAt: '2026-07-14T07:00:00.000Z', excerpt: null, imageUrl: null,
  }, extracted);

  app = Fastify();
  registerApi(app, db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('GET /api/feed', () => {
  it('groups duplicate coverage into one card with alternates, best article first', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/feed' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { cards: any[]; nextBefore: string | null };
    expect(body.cards).toHaveLength(2);
    const pogacar = body.cards.find((c) => c.alternates.length === 1);
    expect(pogacar).toBeDefined();
    // Best = the one with substantial full text (g1), alternate = g2.
    expect(pogacar.article.url).toBe('https://example.com/g1');
    expect(pogacar.article.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(pogacar.alternates[0].readingMinutes).toBeNull();
    expect(pogacar.alternates[0].url).toBe('https://example.com/g2');
  });

  it('filters by category', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/feed?category=gear' });
    const body = res.json() as { cards: any[] };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].article.category).toBe('gear');
  });

  it('respects term mutes', async () => {
    await app.inject({
      method: 'POST', url: '/api/mutes',
      payload: { kind: 'term', value: 'pogacar' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/feed' });
    const body = res.json() as { cards: any[] };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].article.title).toContain('gravel');
    const mutes = (await app.inject({ method: 'GET', url: '/api/mutes' })).json() as any[];
    await app.inject({ method: 'DELETE', url: `/api/mutes/${mutes[0].id}` });
  });
});

describe('read state', () => {
  it('marks read on demand and reflects it in unread filter', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const id = feed.cards[0].article.id;
    await app.inject({ method: 'POST', url: `/api/articles/${id}/read` });
    const unread = (await app.inject({ method: 'GET', url: '/api/feed?unread=1' })).json() as { cards: any[] };
    expect(unread.cards.every((c) => c.article.id !== id)).toBe(true);

    const status = (await app.inject({ method: 'GET', url: '/api/status' })).json() as { articles: number; unread: number };
    expect(status.articles).toBe(3);
    expect(status.unread).toBeLessThan(3);
  });
});

describe('cluster read state', () => {
  it('marks a whole cluster read and unread again', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const clustered = feed.cards.find((c) => c.alternates.length === 1);
    await app.inject({ method: 'POST', url: `/api/clusters/${clustered.clusterId}/read` });

    const unread = (await app.inject({ method: 'GET', url: '/api/feed?unread=1' })).json() as { cards: any[] };
    expect(unread.cards.every((c) => c.clusterId !== clustered.clusterId)).toBe(true);

    await app.inject({ method: 'POST', url: `/api/clusters/${clustered.clusterId}/unread` });
    const restored = (await app.inject({ method: 'GET', url: '/api/feed?unread=1' })).json() as { cards: any[] };
    const card = restored.cards.find((c) => c.clusterId === clustered.clusterId);
    expect(card).toBeDefined();
    // Both the primary article and its alternate are unread again.
    expect(card.read).toBe(false);
    expect(card.alternates.every((alt: any) => !alt.read)).toBe(true);
  });
});

describe('riders', () => {
  it('aggregates riders across name variants and filters the feed', async () => {
    const { saveRiders } = await import('../src/pipeline/refresh.js');
    // Same rider with and without diacritics on two articles, once elsewhere.
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const [c1, c2] = feed.cards;
    await saveRiders(db, c1.article.id, ['Tadej Pogačar', 'Remco Evenepoel']);
    await saveRiders(db, c2.article.id, ['Tadej Pogacar']);

    const riders = (await app.inject({ method: 'GET', url: '/api/riders' })).json() as any[];
    const pog = riders.find((r) => r.key === 'tadej pogacar');
    expect(pog).toBeDefined();
    expect(pog.articles).toBe(2);
    expect(riders.find((r) => r.key === 'remco evenepoel')?.articles).toBe(1);

    const filtered = (
      await app.inject({ method: 'GET', url: '/api/feed?rider=tadej%20pogacar' })
    ).json() as { cards: any[] };
    const ids = filtered.cards.map((c) => c.article.id);
    expect(ids).toContain(c1.article.id);
    expect(ids).toContain(c2.article.id);

    const single = (
      await app.inject({ method: 'GET', url: `/api/articles/${c1.article.id}` })
    ).json() as { riders: { key: string; name: string }[] };
    expect(single.riders.map((r) => r.key).sort()).toEqual(['remco evenepoel', 'tadej pogacar']);
  });
});

describe('LLM model setting', () => {
  it('persists, surfaces in status, feeds the pipeline, and resets', async () => {
    const put = await app.inject({
      method: 'PUT', url: '/api/settings/llm',
      payload: { model: 'deepseek/deepseek-v4-pro' },
    });
    expect(put.json().custom).toBe('deepseek/deepseek-v4-pro');

    const status = (await app.inject({ method: 'GET', url: '/api/status' })).json() as any;
    expect(status.llm.model).toBe('deepseek/deepseek-v4-pro');

    const { refreshAll } = await import('../src/pipeline/refresh.js');
    const { currentLlmModel } = await import('../src/llm.js');
    await refreshAll(db, { extract: async () => ({ contentHtml: null, contentText: null, imageUrl: null, author: null }) });
    expect(currentLlmModel()).toBe('deepseek/deepseek-v4-pro');

    const bad = await app.inject({ method: 'PUT', url: '/api/settings/llm', payload: { model: 'nope; DROP TABLE' } });
    expect(bad.statusCode).toBe(400);

    const reset = await app.inject({ method: 'PUT', url: '/api/settings/llm', payload: { model: '' } });
    expect(reset.json().custom).toBeNull();
  });
});

describe('races', () => {
  it('links articles to race days, lists them, and serves a spoiler-free detail', async () => {
    const { linkRace } = await import('../src/pipeline/refresh.js');
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const target = feed.cards[0].article;
    await linkRace(db, target.id, {
      name: 'Tour de France', year: 2026, stage: 10, date: '2026-07-14', kind: 'report',
    });

    const races = (await app.inject({ method: 'GET', url: '/api/races' })).json() as any[];
    const tdf = races.find((r) => r.raceName === 'Tour de France 2026');
    expect(tdf).toBeDefined();
    expect(tdf.stageLabel).toBe('Stage 10');
    expect(tdf.articles).toBe(1);

    const detail = (await app.inject({ method: 'GET', url: `/api/races/${tdf.id}` })).json() as any;
    expect(detail.articleCount).toBe(1);
    expect(detail.guide).toBeNull();
    // Spoiler safety: no article titles or urls anywhere in the detail payload.
    expect(JSON.stringify(detail)).not.toContain(target.title.slice(0, 20));

    const filtered = (
      await app.inject({ method: 'GET', url: `/api/feed?race=${tdf.id}` })
    ).json() as { cards: any[] };
    expect(filtered.cards).toHaveLength(1);
    expect(filtered.cards[0].article.id).toBe(target.id);
  });
});

describe('GET /api/catchup', () => {
  it('surfaces high-importance unread clusters and counts the rest', async () => {
    // Known state: everything unread, importance set explicitly.
    await db.query('UPDATE articles SET read_at = NULL', []);
    await db.query("UPDATE articles SET importance = 5 WHERE guid = 'g1'", []);
    await db.query("UPDATE articles SET importance = 1 WHERE guid IN ('g2', 'g3')", []);

    const body = (await app.inject({ method: 'GET', url: '/api/catchup' })).json() as {
      unreadStories: number;
      big: { clusterId: number; score: number; sources: number; article: any }[];
      oldestUnread: string | null;
    };
    // g1+g2 cluster together; g3 stands alone.
    expect(body.unreadStories).toBe(2);
    expect(body.big).toHaveLength(1);
    expect(body.big[0].score).toBe(5);
    expect(body.big[0].sources).toBe(2);
    expect(body.big[0].article.url).toBe('https://example.com/g1');
    expect(body.big[0].article.importance).toBe(5);
    expect(body.oldestUnread).toBe('2026-07-14T07:00:00.000Z');

    // Nothing unread → empty digest.
    await db.query('UPDATE articles SET read_at = $1', [new Date().toISOString()]);
    const empty = (await app.inject({ method: 'GET', url: '/api/catchup' })).json() as any;
    expect(empty.unreadStories).toBe(0);
    expect(empty.big).toHaveLength(0);
    expect(empty.oldestUnread).toBeNull();
    await db.query('UPDATE articles SET read_at = NULL', []);
  });
});

describe('GET /api/articles/:id', () => {
  it('returns full content and cluster alternates', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const withAlt = feed.cards.find((c) => c.alternates.length === 1);
    const res = await app.inject({ method: 'GET', url: `/api/articles/${withAlt.article.id}` });
    const body = res.json() as { contentHtml: string; alternates: any[] };
    expect(body.contentHtml).toContain('long body text');
    expect(body.alternates).toHaveLength(1);
  });

  it('404s on unknown ids', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/articles/99999' });
    expect(res.statusCode).toBe(404);
  });
});
