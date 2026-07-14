/**
 * One-off manual pipeline run from the CLI:  npm run refresh
 * Useful on first install and for debugging feed problems.
 */
import { getDb } from './db.js';
import { refreshAll } from './pipeline/refresh.js';

const db = getDb();
const stats = await refreshAll(db);
for (const s of stats.sources) {
  console.log(
    s.ok ? `✔ ${s.key}: ${s.newArticles} new` : `✘ ${s.key}: ${s.error ?? 'failed'}`
  );
}
console.log(`Total new articles: ${stats.totalNew}`);
