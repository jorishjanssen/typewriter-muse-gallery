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
    // Day dividers follow the newest coverage (g2), not the displayed
    // article (g1) — otherwise Today/Yesterday labels flip around the card.
    expect(pogacar.latestPublishedAt).toBe('2026-07-14T08:30:00.000Z');
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

  it('persists per-task overrides and feeds them to the pipeline', async () => {
    const put = await app.inject({
      method: 'PUT', url: '/api/settings/llm',
      payload: { tasks: { merge: 'anthropic/claude-haiku-4.5' } },
    });
    expect(put.statusCode).toBe(200);
    const body = put.json() as any;
    expect(body.tasks.merge.override).toBe('anthropic/claude-haiku-4.5');
    expect(body.tasks.merge.effective).toBe('anthropic/claude-haiku-4.5');
    // No override → effective follows resolution (main model off-gateway in tests).
    expect(body.tasks.guide.override).toBeNull();

    const { refreshAll } = await import('../src/pipeline/refresh.js');
    const { modelForTask } = await import('../src/llm.js');
    await refreshAll(db, { extract: async () => ({ contentHtml: null, contentText: null, imageUrl: null, author: null }) });
    expect(modelForTask('merge')).toBe('anthropic/claude-haiku-4.5');

    const badTask = await app.inject({
      method: 'PUT', url: '/api/settings/llm', payload: { tasks: { hack: 'x/y' } },
    });
    expect(badTask.statusCode).toBe(400);
    const badModel = await app.inject({
      method: 'PUT', url: '/api/settings/llm', payload: { tasks: { merge: 'nope; DROP TABLE' } },
    });
    expect(badModel.statusCode).toBe(400);

    // Clearing restores automatic resolution.
    const cleared = await app.inject({
      method: 'PUT', url: '/api/settings/llm', payload: { tasks: { merge: '' } },
    });
    expect(cleared.json().tasks.merge.override).toBeNull();
  });

  it('shows the cheap bulk default for gateway-style main models even without a key', async () => {
    // The Vercel function serving the settings UI has no AI key; the display
    // must still match what the (keyed) scraper will resolve.
    await app.inject({
      method: 'PUT', url: '/api/settings/llm', payload: { model: 'deepseek/deepseek-v4-pro' },
    });
    const body = (await app.inject({ method: 'GET', url: '/api/settings/llm' })).json() as any;
    expect(body.tasks.enrich.effective).toBe('deepseek/deepseek-v3.1');
    expect(body.tasks.brief.effective).toBe('deepseek/deepseek-v3.1');
    expect(body.tasks.merge.effective).toBe('deepseek/deepseek-v4-pro');
    expect(body.tasks.guide.effective).toBe('deepseek/deepseek-v4-pro');
    await app.inject({ method: 'PUT', url: '/api/settings/llm', payload: { model: '' } });
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

describe('engagement tracking', () => {
  it('distinguishes opened from skipped and reports per-source read rates', async () => {
    await db.query('UPDATE articles SET read_at = NULL, opened_at = NULL, seen_at = NULL', []);
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const grouped = feed.cards.find((c) => c.alternates.length === 1); // g1 (cyclingnews) + g2 (wielerflits)
    const solo = feed.cards.find((c) => c.alternates.length === 0); // g3 (bikeradar)

    // Opening an article in the reader = read.
    await app.inject({ method: 'POST', url: `/api/articles/${grouped.article.id}/read` });
    // Scrolling past / swiping a card = the whole cluster is skipped —
    // except articles that were already opened.
    await app.inject({ method: 'POST', url: `/api/clusters/${grouped.clusterId}/read` });
    await app.inject({ method: 'POST', url: `/api/clusters/${solo.clusterId}/read` });

    const rows = await db.query<{ guid: string; opened_at: string | null; seen_at: string | null }>(
      'SELECT guid, opened_at, seen_at FROM articles ORDER BY guid'
    );
    const byGuid = Object.fromEntries(rows.map((r) => [r.guid, r]));
    expect(byGuid.g1.opened_at).not.toBeNull();
    expect(byGuid.g1.seen_at).toBeNull();
    expect(byGuid.g2.opened_at).toBeNull();
    expect(byGuid.g2.seen_at).not.toBeNull();
    expect(byGuid.g3.seen_at).not.toBeNull();

    const sources = (await app.inject({ method: 'GET', url: '/api/sources' })).json() as any[];
    const cn = sources.find((s) => s.key === 'cyclingnews');
    expect(cn.opened).toBe(1);
    expect(cn.skipped).toBe(0);
    expect(cn.readPct).toBe(100);
    const br = sources.find((s) => s.key === 'bikeradar');
    expect(br.opened).toBe(0);
    expect(br.skipped).toBe(1);
    expect(br.readPct).toBe(0);
    // No triage yet for a source → no percentage rather than a misleading 0.
    expect(sources.find((s) => s.key === 'velo').readPct).toBeNull();

    // Undo retracts the skip judgment; bulk read-all stamps neither.
    await app.inject({ method: 'POST', url: `/api/clusters/${solo.clusterId}/unread` });
    const after = await db.query<{ seen_at: string | null }>(
      "SELECT seen_at FROM articles WHERE guid = 'g3'"
    );
    expect(after[0].seen_at).toBeNull();
    await app.inject({ method: 'POST', url: '/api/read-all' });
    const bulk = await db.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM articles WHERE guid = 'g3' AND seen_at IS NOT NULL"
    );
    expect(bulk[0].n).toBe(0);
    await db.query('UPDATE articles SET read_at = NULL', []);
  });
});

describe('GET /api/articles/:id/next-unread', () => {
  it('continues down the feed, skips own cluster and mutes, wraps at the end', async () => {
    await db.query('UPDATE articles SET read_at = NULL, seen_at = NULL, opened_at = NULL', []);
    // Published order: g2 (08:30) > g1 (08:00, same cluster as g2) > g3 (07:00).
    const byGuid = Object.fromEntries(
      (await db.query<{ guid: string; id: number }>('SELECT guid, id FROM articles')).map((r) => [r.guid, r.id])
    );

    // From g1: g2 shares the cluster, so the next unread down the feed is g3.
    const fromG1 = (await app.inject({ method: 'GET', url: `/api/articles/${byGuid.g1}/next-unread` })).json() as any;
    expect(fromG1.id).toBe(byGuid.g3);

    // From g3 (bottom of the feed): wraps to the newest unread outside its cluster.
    const fromG3 = (await app.inject({ method: 'GET', url: `/api/articles/${byGuid.g3}/next-unread` })).json() as any;
    expect([byGuid.g1, byGuid.g2]).toContain(fromG3.id);

    // A muted source is never suggested.
    await app.inject({ method: 'POST', url: '/api/mutes', payload: { kind: 'source', value: 'bikeradar' } });
    const muted = (await app.inject({ method: 'GET', url: `/api/articles/${byGuid.g1}/next-unread` })).json() as any;
    expect(muted.id).toBeNull(); // g3 is bikeradar, g2 shares g1's cluster
    const mutes = (await app.inject({ method: 'GET', url: '/api/mutes' })).json() as any[];
    await app.inject({ method: 'DELETE', url: `/api/mutes/${mutes[0].id}` });

    // Nothing unread anywhere → null.
    await db.query('UPDATE articles SET read_at = $1', [new Date().toISOString()]);
    const none = (await app.inject({ method: 'GET', url: `/api/articles/${byGuid.g1}/next-unread` })).json() as any;
    expect(none.id).toBeNull();
    await db.query('UPDATE articles SET read_at = NULL', []);
  });
});

describe('likes', () => {
  it('toggles a thumbs-up and counts it per source', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const target = feed.cards[0].article;
    expect(target.liked).toBe(false);

    await app.inject({ method: 'POST', url: `/api/articles/${target.id}/like` });
    const after = (await app.inject({ method: 'GET', url: `/api/articles/${target.id}` })).json() as any;
    expect(after.liked).toBe(true);

    const sources = (await app.inject({ method: 'GET', url: '/api/sources' })).json() as any[];
    expect(sources.find((s) => s.key === target.sourceKey).liked).toBe(1);

    await app.inject({ method: 'POST', url: `/api/articles/${target.id}/unlike` });
    const undone = (await app.inject({ method: 'GET', url: `/api/articles/${target.id}` })).json() as any;
    expect(undone.liked).toBe(false);
  });
});

describe('cluster brief in feed', () => {
  it('exposes the merged brief on multi-source cards only', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const grouped = feed.cards.find((c) => c.alternates.length === 1);
    const solo = feed.cards.find((c) => c.alternates.length === 0);
    expect(grouped.clusterBrief).toBeNull();

    await db.query('UPDATE clusters SET brief = $1, brief_article_count = 2 WHERE id = $2', [
      'Merged coverage of the story from every source.',
      grouped.clusterId,
    ]);
    const after = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    expect(after.cards.find((c) => c.clusterId === grouped.clusterId).clusterBrief).toBe(
      'Merged coverage of the story from every source.'
    );
    expect(after.cards.find((c) => c.clusterId === solo.clusterId).clusterBrief).toBeNull();
  });
});

describe('GET /api/race-banner', () => {
  it('shows only on race day, in pre-guide and guide-ready phases', async () => {
    // The TdF race from the races test is dated 2026-07-14 (not today) —
    // past races never banner, guide or not.
    const empty = (await app.inject({ method: 'GET', url: '/api/race-banner' })).json() as any;
    expect(empty.raceId).toBeNull();

    // A race happening TODAY (reader's calendar) banners even without a guide.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
    const { linkRace } = await import('../src/pipeline/refresh.js');
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const solo = feed.cards.find((c) => c.alternates.length === 0).article;
    await linkRace(db, solo.id, {
      name: 'Ronde van Vandaag', year: 2026, stage: null, date: today, kind: 'preview',
    });

    const pre = (await app.inject({ method: 'GET', url: '/api/race-banner' })).json() as any;
    expect(pre.raceName).toBe('Ronde van Vandaag 2026');
    expect(pre.hasGuide).toBe(false);

    // The guide arriving flips the phase.
    const race = (
      await db.query<{ id: number }>("SELECT id FROM races WHERE race_name = 'Ronde van Vandaag 2026'")
    )[0];
    await db.query(
      'INSERT INTO watch_guides (race_id, generated_at, article_count, guide) VALUES ($1, $2, $3, $4)',
      [race.id, new Date().toISOString(), 1, '{"excitement":4,"summary":"x","tiers":[]}']
    );
    const ready = (await app.inject({ method: 'GET', url: '/api/race-banner' })).json() as any;
    expect(ready.raceId).toBe(race.id);
    expect(ready.hasGuide).toBe(true);
    // Spoiler safety: guide content is never in the banner payload.
    expect(JSON.stringify(ready)).not.toContain('excitement');

    // Clean up today's race so later tests see the original state.
    await db.query('UPDATE articles SET race_id = NULL, race_kind = NULL WHERE race_id = $1', [race.id]);
    await db.query('DELETE FROM races WHERE id = $1', [race.id]);
    const gone = (await app.inject({ method: 'GET', url: '/api/race-banner' })).json() as any;
    expect(gone.raceId).toBeNull();
  });
});

describe('race pre/post split', () => {
  it('separates previews from post-race stories in counts and the feed', async () => {
    const { linkRace } = await import('../src/pipeline/refresh.js');
    const feed = (await app.inject({ method: 'GET', url: '/api/feed' })).json() as { cards: any[] };
    const grouped = feed.cards.find((c) => c.alternates.length === 1);
    // g1 is already linked to TdF stage 10 as a report; link g2 as a preview.
    await linkRace(db, grouped.alternates[0].id, {
      name: 'Tour de France', year: 2026, stage: 10, date: '2026-07-14', kind: 'preview',
    });

    const races = (await app.inject({ method: 'GET', url: '/api/races' })).json() as any[];
    const tdf = races.find((r) => r.raceName === 'Tour de France 2026');
    const detail = (await app.inject({ method: 'GET', url: `/api/races/${tdf.id}` })).json() as any;
    expect(detail.previewCount).toBe(1);
    expect(detail.spoilerCount).toBe(1);

    const previews = (
      await app.inject({ method: 'GET', url: `/api/feed?race=${tdf.id}&raceKind=preview` })
    ).json() as { cards: any[] };
    expect(previews.cards).toHaveLength(1);
    expect(previews.cards[0].article.id).toBe(grouped.alternates[0].id);

    const post = (
      await app.inject({ method: 'GET', url: `/api/feed?race=${tdf.id}&raceKind=post` })
    ).json() as { cards: any[] };
    expect(post.cards).toHaveLength(1);
    expect(post.cards[0].article.id).toBe(grouped.article.id);
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
