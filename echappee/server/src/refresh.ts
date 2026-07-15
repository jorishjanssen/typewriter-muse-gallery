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
    console.log(
      s.ok
        ? `✔ ${s.key}: ${s.newArticles} new${s.skipped ? `, ${s.skipped} skipped (no article text)` : ''}`
        : `✘ ${s.key}: ${s.error ?? 'failed'}`
    ),
});
const failures = stats.sources.filter((s) => !s.ok).length;
console.log(
  `Total new: ${stats.totalNew}; repaired: ${stats.repaired}; removed non-articles: ${stats.removed}; clusters merged: ${stats.merged}`
);
await db.close();
// Exit explicitly: lingering sockets/handles otherwise keep Node alive and a
// CI job hangs until its timeout. Non-zero only when every source failed.
process.exit(failures > 0 && failures === stats.sources.length ? 1 : 0);
