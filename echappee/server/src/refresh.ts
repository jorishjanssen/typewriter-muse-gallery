/**
 * One-off manual pipeline run from the CLI:  npm run refresh
 * Useful on first install and for debugging feed problems.
 */
import { getDb } from './db.js';
import { refreshAll } from './pipeline/refresh.js';

const db = await getDb();
// Log per source as it completes, so a killed run still leaves useful logs.
const stats = await refreshAll(db, {
  onSource: (s) =>
    console.log(s.ok ? `✔ ${s.key}: ${s.newArticles} new` : `✘ ${s.key}: ${s.error ?? 'failed'}`),
});
const failures = stats.sources.filter((s) => !s.ok).length;
console.log(`Total new articles: ${stats.totalNew}`);
await db.close();
// Exit explicitly: lingering sockets/handles otherwise keep Node alive and a
// CI job hangs until its timeout. Non-zero only when every source failed.
process.exit(failures > 0 && failures === stats.sources.length ? 1 : 0);
