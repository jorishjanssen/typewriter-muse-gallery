import { nowIso, type Db } from '../db.js';
import { judgeClusterMerge, type ClusterDigest } from '../llm.js';
import { touchCluster } from './cluster.js';

/**
 * Periodic cluster merge pass. Clusters form once at ingest and the match
 * can miss — most often across languages, where a Dutch and an English
 * report of the same event share no title tokens. This pass proposes likely
 * duplicate pairs from cheap signals (shared riders, reports of the same
 * race day), has the LLM verify each pair once, and merges confirmed ones.
 */

export interface MergeCandidate {
  a: number;
  b: number;
}

/**
 * Candidate pairs of recent clusters that might cover the same event,
 * normalized a < b, already-reviewed pairs excluded. Signals:
 *  - two clusters whose articles mention the same rider, or
 *  - two clusters holding race *reports* of the same race day.
 */
export async function findMergeCandidates(
  db: Db,
  hours = 48
): Promise<MergeCandidate[]> {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await db.query<{ a: number; b: number }>(
    `SELECT a, b FROM (
       SELECT a1.cluster_id AS a, a2.cluster_id AS b
       FROM article_riders r1
       JOIN articles a1 ON a1.id = r1.article_id
       JOIN article_riders r2 ON r2.rider_key = r1.rider_key
       JOIN articles a2 ON a2.id = r2.article_id
       WHERE a1.cluster_id < a2.cluster_id
         AND a1.published_at >= $1 AND a2.published_at >= $1
       UNION
       SELECT a1.cluster_id, a2.cluster_id
       FROM articles a1
       JOIN articles a2 ON a2.race_id = a1.race_id
       WHERE a1.cluster_id < a2.cluster_id
         AND a1.race_kind = 'report' AND a2.race_kind = 'report'
         AND a2.published_at >= $1
     ) pairs
     WHERE NOT EXISTS (
       SELECT 1 FROM merge_reviews m WHERE m.cluster_a = pairs.a AND m.cluster_b = pairs.b
     )
     ORDER BY b DESC`,
    [cutoff]
  );
  return rows;
}

/** Fold cluster `from` into cluster `into`; article-level read state survives. */
export async function mergeClusters(db: Db, from: number, into: number): Promise<void> {
  // If the surviving story was already fully triaged, the folded-in coverage
  // inherits that — a merge must not resurrect a seen brief as new.
  const target = (
    await db.query<{ total: number; unread: number }>(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END)::int AS unread
       FROM articles WHERE cluster_id = $1`,
      [into]
    )
  )[0];
  await db.query('UPDATE articles SET cluster_id = $1 WHERE cluster_id = $2', [into, from]);
  if (target && target.total > 0 && Number(target.unread ?? 0) === 0) {
    await db.query('UPDATE articles SET read_at = $1 WHERE cluster_id = $2 AND read_at IS NULL', [
      nowIso(),
      into,
    ]);
  }
  // A bookmark on either half survives the merge.
  await db.query(
    `UPDATE clusters SET bookmarked_at = COALESCE(bookmarked_at,
       (SELECT bookmarked_at FROM clusters WHERE id = $2))
     WHERE id = $1`,
    [into, from]
  );
  // merge_reviews rows for the dead cluster cascade away with it.
  await db.query('DELETE FROM clusters WHERE id = $1', [from]);
  await touchCluster(db, into);
}

async function clusterDigest(db: Db, id: number): Promise<ClusterDigest | null> {
  const rows = await db.query<{ title: string; summary: string | null }>(
    'SELECT title, summary FROM articles WHERE cluster_id = $1 ORDER BY published_at ASC LIMIT 4',
    [id]
  );
  if (rows.length === 0) return null;
  return {
    titles: rows.map((r) => r.title),
    summary: rows.find((r) => r.summary)?.summary ?? null,
  };
}

/**
 * Verify up to `limit` candidate pairs with the LLM and merge confirmed
 * duplicates (into the older cluster). Every verdict is recorded so a pair
 * is judged at most once. Returns the number of merges performed.
 */
export async function mergeDuplicateClusters(
  db: Db,
  opts: { limit?: number; judge?: typeof judgeClusterMerge } = {}
): Promise<number> {
  const limit = opts.limit ?? 5;
  const judge = opts.judge ?? judgeClusterMerge;
  const candidates = await findMergeCandidates(db);
  let merged = 0;
  for (const pair of candidates.slice(0, limit)) {
    const [a, b] = await Promise.all([clusterDigest(db, pair.a), clusterDigest(db, pair.b)]);
    if (!a || !b) continue;
    const same = await judge(a, b);
    if (same === null) continue; // LLM failure — retry on a later run
    await db.query(
      `INSERT INTO merge_reviews (cluster_a, cluster_b, same, checked_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [pair.a, pair.b, same, nowIso()]
    );
    if (same) {
      // The older cluster survives; the newer one folds into it.
      await mergeClusters(db, pair.b, pair.a);
      merged++;
    }
  }
  return merged;
}
