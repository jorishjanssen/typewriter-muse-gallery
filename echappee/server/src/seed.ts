/**
 * Seed the database with realistic sample articles (fixtures/sample-articles.json)
 * so the UI is usable before the scraper has run — and so the whole pipeline
 * (categorization, clustering, feed grouping) can be exercised offline.
 *
 *   npm run seed            # add fixtures to the configured DB
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';
import { getSource } from './sources.js';
import { ingestArticle } from './pipeline/refresh.js';
import { htmlToText } from './pipeline/extract.js';

interface Fixture {
  sourceKey: string;
  hoursAgo: number;
  title: string;
  author: string | null;
  url: string;
  excerpt: string;
  paragraphs: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  fs.readFileSync(path.resolve(here, '../fixtures/sample-articles.json'), 'utf8')
) as Fixture[];

const db = await getDb();
let added = 0;

// Oldest first so clustering sees earlier coverage before later duplicates.
for (const f of [...fixtures].sort((a, b) => b.hoursAgo - a.hoursAgo)) {
  const source = getSource(f.sourceKey);
  if (!source) throw new Error(`unknown source in fixtures: ${f.sourceKey}`);
  const html = f.paragraphs.map((p) => `<p>${p}</p>`).join('\n');
  const id = await ingestArticle(
    db,
    source,
    {
      guid: f.url,
      url: f.url,
      title: f.title,
      author: f.author,
      publishedAt: new Date(Date.now() - f.hoursAgo * 3600_000).toISOString(),
      excerpt: f.excerpt,
      imageUrl: null,
    },
    { contentHtml: html, contentText: htmlToText(html), imageUrl: null, author: f.author }
  );
  if (id > 0) added++;
}

console.log(`Seeded ${added} sample articles (${fixtures.length - added} already present).`);
await db.close();
