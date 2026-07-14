/**
 * One-off manual pipeline run from the CLI:  npm run refresh
 * Useful on first install and for debugging feed problems.
 */
import { getDb } from './db.js';
import { refreshAll } from './pipeline/refresh.js';

const db = await getDb();
const stats = await refreshAll(db);
let failures = 0;
for (const s of stats.sources) {
  if (!s.ok) failures++;
  console.log(
    s.ok ? `✔ ${s.key}: ${s.newArticles} new` : `✘ ${s.key}: ${s.error ?? 'failed'}`
  );
}
console.log(`Total new articles: ${stats.totalNew}`);
await db.close();
// Fail CI only when every source failed (one flaky feed shouldn't page anyone).
if (failures > 0 && failures === stats.sources.length) process.exit(1);
