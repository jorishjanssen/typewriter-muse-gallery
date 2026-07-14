import { describe, expect, it } from 'vitest';
import { createMemoryDb } from '../src/db.js';
import { categorizeByKeywords } from '../src/pipeline/categorize.js';
import { createCluster, matchClusterByTitle, recentClusters } from '../src/pipeline/cluster.js';
import { htmlToText } from '../src/pipeline/extract.js';
import { ingestArticle } from '../src/pipeline/refresh.js';
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

describe('parseEnrichment', () => {
  it('parses clean and fenced JSON, clamping bad cluster indices', () => {
    const clean = parseEnrichment('{"summary":"S.","category":"racing","cluster_match":0}', 2);
    expect(clean).toEqual({ summary: 'S.', category: 'racing', clusterMatch: 0 });

    const fenced = parseEnrichment('```json\n{"summary":"S.","category":"nonsense","cluster_match":9}\n```', 2);
    expect(fenced).toEqual({ summary: 'S.', category: 'other', clusterMatch: null });

    expect(parseEnrichment('no json here', 0)).toBeNull();
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
