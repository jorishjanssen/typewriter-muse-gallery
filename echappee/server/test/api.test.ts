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
