import { describe, expect, it } from 'vitest';
import { createMemoryDb } from '../src/db.js';
import { categorizeByKeywords } from '../src/pipeline/categorize.js';
import { createCluster, matchClusterByTitle, recentClusters } from '../src/pipeline/cluster.js';
import { htmlToText, sanitizeFragment } from '../src/pipeline/extract.js';
import { bestContent, ingestArticle } from '../src/pipeline/refresh.js';
import { parseEnrichment } from '../src/llm.js';
import { getSource } from '../src/sources.js';

describe('categorizeByKeywords', () => {
  it('detects transfers in English and Dutch', () => {
    expect(categorizeByKeywords('Star sprinter signs three-year contract extension', '', 'other')).toBe('transfers');
    expect(categorizeByKeywords('Topsprinter verlengt contract met drie jaar', '', 'other')).toBe('transfers');
  });

  it('detects gear, offroad and racing', () => {
    expect(categorizeByKeywords('First ride review: new carbon racer', '', 'other')).toBe('gear');
    expect(categorizeByKeywords('Unbound Gravel contenders to watch', '', 'other')).toBe('offroad');
    expect(categorizeByKeywords('Pogacar wins stage 5 of the Giro', '', 'other')).toBe('racing');
  });

  it('falls back to the source default', () => {
    expect(categorizeByKeywords('An unremarkable headline', 'nothing here', 'gear')).toBe('gear');
  });
});

describe('title clustering fallback', () => {
  it('groups near-identical stories and keeps distinct ones apart', () => {
    const candidates = [
      { id: 1, title: 'Tadej Pogacar storms to solo victory on the Mur de Huy at Fleche Wallonne' },
      { id: 2, title: 'New wireless groupset leaks in race photos' },
    ];
    expect(
      matchClusterByTitle('Pogacar solo victory at Fleche Wallonne on the Mur de Huy', candidates)
    ).toBe(1);
    expect(matchClusterByTitle('Vollering takes command of the Vuelta Femenina', candidates)).toBeNull();
  });

  it('only matches clusters updated recently', async () => {
    const db = await createMemoryDb();
    const id = await createCluster(db, 'Old story');
    const old = new Date(Date.now() - 10 * 24 * 3600_000).toISOString();
    await db.query('UPDATE clusters SET updated_at = $1 WHERE id = $2', [old, id]);
    expect(await recentClusters(db)).toHaveLength(0);
    await db.close();
  });
});

describe('htmlToText', () => {
  it('strips tags and normalizes whitespace', () => {
    const text = htmlToText('<p>Hello <b>world</b></p><script>x()</script><p>Bye &amp; thanks</p>');
    expect(text).toContain('Hello world');
    expect(text).toContain('Bye & thanks');
    expect(text).not.toContain('x()');
  });
});

describe('bestContent', () => {
  const item = (contentHtml: string | null) => ({
    guid: 'g', url: 'https://example.com', title: 'T', author: null,
    publishedAt: new Date().toISOString(), excerpt: null, imageUrl: null, contentHtml,
  });
  const thinPage = { contentHtml: null, contentText: null, imageUrl: 'img', author: 'A' };

  it('falls back to feed content when page extraction is thin', () => {
    const feedHtml = '<p>' + 'volwaardige alinea tekst '.repeat(20) + '</p>';
    const result = bestContent(thinPage, item(feedHtml));
    expect(result.contentText).toContain('volwaardige alinea');
    expect(result.imageUrl).toBe('img');
  });

  it('keeps page extraction when it is at least as rich', () => {
    const richPage = { contentHtml: '<p>x</p>', contentText: 'x'.repeat(5000), imageUrl: null, author: null };
    expect(bestContent(richPage, item('<p>short teaser</p>'))).toBe(richPage);
    expect(bestContent(thinPage, item(null))).toBe(thinPage);
  });

  it('sanitizes feed HTML', () => {
    const feedHtml =
      '<p onclick="evil()">' + 'echte inhoud van het artikel '.repeat(20) + '</p><script>evil()</script>';
    const result = bestContent(thinPage, item(feedHtml));
    expect(result.contentHtml).not.toContain('<script>');
    expect(result.contentHtml).not.toContain('onclick');
  });
});

describe('sanitizeFragment', () => {
  it('strips scripts, handlers and javascript links', () => {
    const out = sanitizeFragment(
      '<p onmouseover=hack() >hi</p><a href="javascript:bad()">x</a><script>b()</script><style>.x{}</style>'
    );
    expect(out).toBe('<p >hi</p><a href="#">x</a>');
  });
});

describe('parseEnrichment', () => {
  it('parses clean and fenced JSON, clamping bad cluster indices', () => {
    const clean = parseEnrichment('{"summary":"S.","category":"racing","cluster_match":0}', 2);
    expect(clean).toEqual({ summary: 'S.', category: 'racing', clusterMatch: 0, riders: [], brief: null, race: null, importance: 2, quote: null });

    const fenced = parseEnrichment('```json\n{"summary":"S.","category":"nonsense","cluster_match":9}\n```', 2);
    expect(fenced).toEqual({ summary: 'S.', category: 'other', clusterMatch: null, riders: [], brief: null, race: null, importance: 2, quote: null });

    expect(parseEnrichment('no json here', 0)).toBeNull();
  });

  it('keeps a valid quote and drops junk ones', () => {
    const ok = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"quote":{"text":"\\"Dit is de mooiste dag van mijn leven, ik kan het niet geloven.\\"","who":"Isaac del Toro"}}',
      0
    );
    expect(ok?.quote).toEqual({
      text: 'Dit is de mooiste dag van mijn leven, ik kan het niet geloven.',
      who: 'Isaac del Toro',
    });
    const short = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"quote":{"text":"Top!","who":"X Y"}}',
      0
    );
    expect(short?.quote).toBeNull();
    const noWho = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"quote":{"text":"A quote long enough to pass the length check"}}',
      0
    );
    expect(noWho?.quote).toBeNull();
  });

  it('clamps importance to 1-5 and defaults to 2', () => {
    const high = parseEnrichment('{"summary":"S.","category":"racing","cluster_match":null,"importance":9}', 0);
    expect(high?.importance).toBe(5);
    const low = parseEnrichment('{"summary":"S.","category":"racing","cluster_match":null,"importance":0}', 0);
    expect(low?.importance).toBe(1);
    const junk = parseEnrichment('{"summary":"S.","category":"racing","cluster_match":null,"importance":"big"}', 0);
    expect(junk?.importance).toBe(2);
  });

  it('keeps a valid brief and drops junk ones', () => {
    const ok = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"brief":"Pogacar wint de Waalse Pijl na een solo van 400 meter op de Muur van Hoei."}',
      0
    );
    expect(ok?.brief).toContain('Waalse Pijl');
    const junk = parseEnrichment('{"summary":"S.","category":"racing","cluster_match":null,"brief":"too short"}', 0);
    expect(junk?.brief).toBeNull();
  });

  it('validates and caps riders', () => {
    const result = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"riders":["Tadej Pogačar"," Remco Evenepoel ","Tadej Pogačar",42,"Wout van Aert","Jonas Vingegaard"]}',
      0
    );
    expect(result?.riders).toEqual(['Tadej Pogačar', 'Remco Evenepoel', 'Wout van Aert']);
  });
});

describe('parseMergeVerdict', () => {
  it('accepts only unambiguous booleans', async () => {
    const { parseMergeVerdict } = await import('../src/llm.js');
    expect(parseMergeVerdict('{"same": true}')).toBe(true);
    expect(parseMergeVerdict('```json\n{"same": false}\n```')).toBe(false);
    expect(parseMergeVerdict('{"same": "yes"}')).toBeNull();
    expect(parseMergeVerdict('probably the same')).toBeNull();
  });
});

describe('cluster merge pass', () => {
  async function seedTwoClusters(db: Awaited<ReturnType<typeof createMemoryDb>>) {
    const { saveRiders } = await import('../src/pipeline/refresh.js');
    const cn = getSource('cyclingnews')!;
    const wf = getSource('wielerflits')!;
    const extracted = { contentHtml: '<p>body</p>', contentText: 'body '.repeat(60), imageUrl: null, author: null };
    const base = { author: null, publishedAt: new Date().toISOString(), excerpt: null, imageUrl: null };
    // Cross-language titles: no token overlap, so they land in separate clusters.
    const id1 = await ingestArticle(db, cn, {
      ...base, guid: 'm1', url: 'https://example.com/m1',
      title: 'Del Toro takes maiden monument at Il Lombardia',
    }, extracted);
    const id2 = await ingestArticle(db, wf, {
      ...base, guid: 'm2', url: 'https://example.com/m2',
      title: 'Mexicaan soleert naar zege in Ronde van Lombardije',
    }, extracted);
    await saveRiders(db, id1, ['Isaac del Toro']);
    await saveRiders(db, id2, ['Isaac del Toro']);
    const clusters = await db.query<{ id: number; cluster_id: number }>(
      'SELECT id, cluster_id FROM articles ORDER BY id'
    );
    return { id1, id2, c1: clusters[0].cluster_id, c2: clusters[1].cluster_id };
  }

  it('proposes rider-sharing cross-cluster pairs and remembers verdicts', async () => {
    const { findMergeCandidates, mergeDuplicateClusters } = await import('../src/pipeline/merge.js');
    const db = await createMemoryDb();
    const { c1, c2 } = await seedTwoClusters(db);
    expect(c1).not.toBe(c2);

    expect(await findMergeCandidates(db)).toEqual([{ a: c1, b: c2 }]);

    // Judge says "different" — nothing merges and the pair is never re-asked.
    let calls = 0;
    const no = async () => { calls++; return false; };
    expect(await mergeDuplicateClusters(db, { judge: no })).toBe(0);
    expect(await mergeDuplicateClusters(db, { judge: no })).toBe(0);
    expect(calls).toBe(1);
    expect(await findMergeCandidates(db)).toEqual([]);
    await db.close();
  });

  it('merges a confirmed pair into the older cluster', async () => {
    const { mergeDuplicateClusters } = await import('../src/pipeline/merge.js');
    const db = await createMemoryDb();
    const { c1, c2 } = await seedTwoClusters(db);
    // A bookmark on the cluster that gets folded away must survive the merge.
    await db.query('UPDATE clusters SET bookmarked_at = $1 WHERE id = $2', [
      new Date().toISOString(), c2,
    ]);

    expect(await mergeDuplicateClusters(db, { judge: async () => true })).toBe(1);
    const rows = await db.query<{ cluster_id: number }>('SELECT cluster_id FROM articles');
    expect(rows.map((r) => r.cluster_id)).toEqual([c1, c1]);
    expect(await db.query('SELECT 1 FROM clusters WHERE id = $1', [c2])).toHaveLength(0);
    const kept = await db.query<{ bookmarked_at: string | null }>(
      'SELECT bookmarked_at FROM clusters WHERE id = $1', [c1]
    );
    expect(kept[0].bookmarked_at).not.toBeNull();
    // Neither half was read, so the merged story must still be new.
    const reads = await db.query<{ read_at: string | null }>('SELECT read_at FROM articles');
    expect(reads.every((r) => r.read_at === null)).toBe(true);
    await db.close();
  });

  it('a merge into a fully seen story keeps the card seen', async () => {
    const { mergeDuplicateClusters } = await import('../src/pipeline/merge.js');
    const db = await createMemoryDb();
    const { c1, c2 } = await seedTwoClusters(db);
    // The reader triaged the older story; the newer duplicate never surfaced.
    await db.query('UPDATE articles SET read_at = $1 WHERE cluster_id = $2', [
      new Date().toISOString(), c1,
    ]);
    expect(await mergeDuplicateClusters(db, { judge: async () => true })).toBe(1);
    const rows = await db.query<{ read_at: string | null }>(
      'SELECT read_at FROM articles WHERE cluster_id = $1', [c1]
    );
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.read_at !== null)).toBe(true);
    expect(await db.query('SELECT 1 FROM clusters WHERE id = $1', [c2])).toHaveLength(0);
    await db.close();
  });

  it('keeps unresolved pairs (LLM failure) for a later run', async () => {
    const { findMergeCandidates, mergeDuplicateClusters } = await import('../src/pipeline/merge.js');
    const db = await createMemoryDb();
    await seedTwoClusters(db);
    expect(await mergeDuplicateClusters(db, { judge: async () => null })).toBe(0);
    expect(await findMergeCandidates(db)).toHaveLength(1);
    await db.close();
  });

  it('proposes reports of the same race day as candidates', async () => {
    const { findMergeCandidates } = await import('../src/pipeline/merge.js');
    const { linkRace } = await import('../src/pipeline/refresh.js');
    const db = await createMemoryDb();
    const cn = getSource('cyclingnews')!;
    const wf = getSource('wielerflits')!;
    const extracted = { contentHtml: '<p>x</p>', contentText: 'x '.repeat(120), imageUrl: null, author: null };
    const base = { author: null, publishedAt: new Date().toISOString(), excerpt: null, imageUrl: null };
    const id1 = await ingestArticle(db, cn, {
      ...base, guid: 'r1', url: 'https://example.com/r1', title: 'Brutal crosswinds split the peloton',
    }, extracted);
    const id2 = await ingestArticle(db, wf, {
      ...base, guid: 'r2', url: 'https://example.com/r2', title: 'Waaiers zorgen voor chaos in de finale',
    }, extracted);
    const race = { name: 'Tour de France', year: 2026, stage: 3, date: '2026-07-07', kind: 'report' as const };
    await linkRace(db, id1, race);
    await linkRace(db, id2, race);
    expect(await findMergeCandidates(db)).toHaveLength(1);
    await db.close();
  });
});

describe('cluster briefs', () => {
  it('parseClusterBrief accepts a real brief and rejects junk', async () => {
    const { parseClusterBrief } = await import('../src/llm.js');
    expect(
      parseClusterBrief('{"brief":"Pogacar wint de Waalse Pijl na een late solo; concurrenten zagen hem pas op de streep terug."}')
    ).toContain('Waalse Pijl');
    expect(parseClusterBrief('{"brief":"too short"}')).toBeNull();
    expect(parseClusterBrief('no json')).toBeNull();
  });

  it('generates for multi-article clusters only, once per size, and again when the cluster grows', async () => {
    const { refreshClusterBriefs } = await import('../src/pipeline/clusterBriefs.js');
    const db = await createMemoryDb();
    const cn = getSource('cyclingnews')!;
    const wf = getSource('wielerflits')!;
    const extracted = { contentHtml: '<p>x</p>', contentText: 'x '.repeat(150), imageUrl: null, author: null };
    const base = { author: null, publishedAt: new Date().toISOString(), excerpt: null, imageUrl: null };
    // One two-source story (title overlap clusters them) and one solo story.
    await ingestArticle(db, cn, {
      ...base, guid: 'b1', url: 'https://example.com/b1',
      title: 'Pogacar storms to solo victory at Fleche Wallonne on the Mur de Huy',
    }, extracted);
    await ingestArticle(db, wf, {
      ...base, guid: 'b2', url: 'https://example.com/b2',
      title: 'Pogacar wins solo at Fleche Wallonne after attack on the Mur de Huy',
    }, extracted);
    await ingestArticle(db, cn, {
      ...base, guid: 'b3', url: 'https://example.com/b3',
      title: 'New wireless groupset leaks in race photos',
    }, extracted);

    const calls: { n: number; lang: string }[] = [];
    const generate = async (articles: { title: string; gist: string | null }[], lang: string) => {
      calls.push({ n: articles.length, lang });
      return 'Merged brief covering every source of this story in one post.';
    };

    expect(await refreshClusterBriefs(db, { generate })).toBe(1);
    expect(calls).toEqual([{ n: 2, lang: 'en' }]);
    const cluster = await db.query<{ brief: string; brief_article_count: number }>(
      'SELECT brief, brief_article_count FROM clusters WHERE brief IS NOT NULL'
    );
    expect(cluster).toHaveLength(1);
    expect(cluster[0].brief_article_count).toBe(2);

    // Same size → nothing to do.
    expect(await refreshClusterBriefs(db, { generate })).toBe(0);
    expect(calls).toHaveLength(1);

    // A third source joins the story → the brief regenerates from 3 articles.
    await ingestArticle(db, getSource('velo')!, {
      ...base, guid: 'b4', url: 'https://example.com/b4',
      title: 'Solo victory for Pogacar at Fleche Wallonne on the Mur de Huy',
    }, extracted);
    expect(await refreshClusterBriefs(db, { generate })).toBe(1);
    expect(calls[1].n).toBe(3);
    await db.close();
  });

  it('keeps clusters without a brief when the LLM fails', async () => {
    const { refreshClusterBriefs } = await import('../src/pipeline/clusterBriefs.js');
    const db = await createMemoryDb();
    const extracted = { contentHtml: '<p>x</p>', contentText: 'x '.repeat(150), imageUrl: null, author: null };
    const base = { author: null, publishedAt: new Date().toISOString(), excerpt: null, imageUrl: null };
    await ingestArticle(db, getSource('cyclingnews')!, {
      ...base, guid: 'f1', url: 'https://example.com/f1',
      title: 'Pogacar storms to solo victory at Fleche Wallonne on the Mur de Huy',
    }, extracted);
    await ingestArticle(db, getSource('wielerflits')!, {
      ...base, guid: 'f2', url: 'https://example.com/f2',
      title: 'Pogacar wins solo at Fleche Wallonne after attack on the Mur de Huy',
    }, extracted);
    expect(await refreshClusterBriefs(db, { generate: async () => null })).toBe(0);
    // Still pending, so the next run retries.
    expect(await refreshClusterBriefs(db, { generate: async () => 'A merged brief that is long enough.' })).toBe(1);
    await db.close();
  });
});

describe('parseWatchGuide', () => {
  it('ranks options by rating, clamps values, drops junk', async () => {
    const { parseWatchGuide } = await import('../src/llm.js');
    const g = parseWatchGuide(JSON.stringify({
      options: [
        { from_km: 12, minutes: 25, rating: 2 },
        { from_km: 45, minutes: 90, rating: 9 }, // clamps to 5, ranks first
        { from_km: 9999, minutes: 45, rating: 4 }, // out of range → dropped
        { from_km: 130, minutes: 'full', rating: 4 },
      ],
    }));
    expect(g?.options).toEqual([
      { fromKm: 45, minutes: 90, rating: 5 },
      { fromKm: 130, minutes: 'full', rating: 4 },
      { fromKm: 12, minutes: 25, rating: 2 },
    ]);
    expect(parseWatchGuide('{"options":[]}')).toBeNull();
    expect(parseWatchGuide('no json')).toBeNull();
  });
});

describe('parse race in enrichment', () => {
  it('validates race refs', () => {
    const ok = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"race":{"name":"Tour de France","year":2026,"stage":10,"date":"2026-07-14","kind":"report"}}',
      0
    );
    expect(ok?.race).toEqual({ name: 'Tour de France', year: 2026, stage: 10, date: '2026-07-14', kind: 'report' });
    const bad = parseEnrichment(
      '{"summary":"S.","category":"racing","cluster_match":null,"race":{"name":"","year":1000}}',
      0
    );
    expect(bad?.race).toBeNull();
  });
});

describe('resolveTaskModel', () => {
  it('routes bulk tasks to the cheap model on the gateway, judgement tasks to the main model', async () => {
    const { resolveTaskModel, CHEAP_BULK_MODEL } = await import('../src/llm.js');
    const main = 'deepseek/deepseek-v4-pro';
    expect(resolveTaskModel('enrich', main, null, true)).toBe(CHEAP_BULK_MODEL);
    expect(resolveTaskModel('brief', main, null, true)).toBe(CHEAP_BULK_MODEL);
    expect(resolveTaskModel('merge', main, null, true)).toBe(main);
    expect(resolveTaskModel('guide', main, null, true)).toBe(main);
    // Explicit override always wins.
    expect(resolveTaskModel('enrich', main, 'anthropic/claude-haiku-4.5', true)).toBe(
      'anthropic/claude-haiku-4.5'
    );
    // Off the gateway, slugs aren't portable — everything follows the main model.
    expect(resolveTaskModel('enrich', 'deepseek-chat', null, false)).toBe('deepseek-chat');
  });
});

describe('raceDayFinished', () => {
  it('gates race days by Amsterdam time', async () => {
    const { raceDayFinished } = await import('../src/pipeline/refresh.js');
    const midRace = new Date('2026-07-16T12:00:00Z'); // 14:00 in Amsterdam
    const evening = new Date('2026-07-16T16:30:00Z'); // 18:30 in Amsterdam
    expect(raceDayFinished('2026-07-15', midRace)).toBe(true); // yesterday
    expect(raceDayFinished('2026-07-16', midRace)).toBe(false); // today, mid-race
    expect(raceDayFinished('2026-07-16', evening)).toBe(true); // today, after finish window
    expect(raceDayFinished('2026-07-17', evening)).toBe(false); // tomorrow
    expect(raceDayFinished(null, midRace)).toBe(true); // undated: can't gate
  });
});

describe('riderKey', () => {
  it('unifies diacritics, case and spacing', async () => {
    const { riderKey } = await import('../src/llm.js');
    expect(riderKey('Tadej Pogačar')).toBe('tadej pogacar');
    expect(riderKey('  tadej   POGACAR ')).toBe('tadej pogacar');
    expect(riderKey('Mathieu van der Poel')).toBe('mathieu van der poel');
  });
});

describe('ingestArticle', () => {
  it('inserts, categorizes and clusters duplicate coverage without an LLM', async () => {
    const db = await createMemoryDb();
    const cyclingnews = getSource('cyclingnews')!;
    const wielerflits = getSource('wielerflits')!;
    const extracted = { contentHtml: '<p>body</p>', contentText: 'body', imageUrl: null, author: null };

    const base = {
      author: null,
      publishedAt: new Date().toISOString(),
      excerpt: null,
      imageUrl: null,
    };
    await ingestArticle(db, cyclingnews, {
      ...base,
      guid: 'a1',
      url: 'https://example.com/a1',
      title: 'Pogacar storms to solo victory at Fleche Wallonne on the Mur de Huy',
    }, extracted);
    await ingestArticle(db, wielerflits, {
      ...base,
      guid: 'a2',
      url: 'https://example.com/a2',
      title: 'Pogacar wins solo at Fleche Wallonne after attack on the Mur de Huy',
    }, extracted);
    await ingestArticle(db, cyclingnews, {
      ...base,
      guid: 'a3',
      url: 'https://example.com/a3',
      title: 'New wireless groupset leaks in race photos',
    }, extracted);

    const rows = await db.query<{ guid: string; category: string; cluster_id: number }>(
      'SELECT guid, category, cluster_id FROM articles ORDER BY guid'
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].cluster_id).toBe(rows[1].cluster_id);
    expect(rows[2].cluster_id).not.toBe(rows[0].cluster_id);
    expect(rows[0].category).toBe('racing');
    expect(rows[2].category).toBe('gear');
    await db.close();
  });

  it('follow-up coverage of a fully seen story inherits the read state', async () => {
    const db = await createMemoryDb();
    const cyclingnews = getSource('cyclingnews')!;
    const wielerflits = getSource('wielerflits')!;
    const sporza = getSource('sporza')!;
    const extracted = { contentHtml: '<p>body</p>', contentText: 'body', imageUrl: null, author: null };
    const base = { author: null, publishedAt: new Date().toISOString(), excerpt: null, imageUrl: null };

    const first = await ingestArticle(db, cyclingnews, {
      ...base, guid: 'f1', url: 'https://example.com/f1',
      title: 'Vingegaard takes yellow with summit finish masterclass in the Alps',
    }, extracted);
    // The reader triages the story...
    await db.query('UPDATE articles SET read_at = $1, seen_at = $1 WHERE id = $2', [
      new Date().toISOString(), first,
    ]);
    // ...then a second source covers the same story: it must arrive read.
    const second = await ingestArticle(db, wielerflits, {
      ...base, guid: 'f2', url: 'https://example.com/f2',
      title: 'Vingegaard pakt geel met masterclass op summit finish in de Alpen',
    }, extracted);
    const rows = await db.query<{ id: number; cluster_id: number; read_at: string | null; seen_at: string | null }>(
      'SELECT id, cluster_id, read_at, seen_at FROM articles ORDER BY id'
    );
    expect(rows[0].cluster_id).toBe(rows[1].cluster_id);
    expect(rows.find((r) => r.id === second)!.read_at).not.toBeNull();
    // Not a skip judgment — the reader never saw this specific article.
    expect(rows.find((r) => r.id === second)!.seen_at).toBeNull();

    // But a story with unread coverage keeps new arrivals new.
    await db.query('UPDATE articles SET read_at = NULL WHERE id = $1', [first]);
    const third = await ingestArticle(db, sporza, {
      ...base, guid: 'f3', url: 'https://example.com/f3',
      title: 'Vingegaard verovert geel na masterclass op de summit finish (Alpen)',
    }, extracted);
    const after = await db.query<{ id: number; read_at: string | null }>(
      'SELECT id, read_at FROM articles WHERE id = $1', [third]
    );
    expect(after[0].read_at).toBeNull();
    await db.close();
  });

  it('is idempotent on duplicate guids', async () => {
    const db = await createMemoryDb();
    const source = getSource('velo')!;
    const item = {
      guid: 'dup',
      url: 'https://example.com/dup',
      title: 'Some headline about a race stage win',
      author: null,
      publishedAt: new Date().toISOString(),
      excerpt: null,
      imageUrl: null,
    };
    const extracted = { contentHtml: null, contentText: null, imageUrl: null, author: null };
    await ingestArticle(db, source, item, extracted);
    await ingestArticle(db, source, item, extracted);
    const count = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM articles');
    expect(count[0].n).toBe(1);
    await db.close();
  });
});
