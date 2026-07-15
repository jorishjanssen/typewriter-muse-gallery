import { nowIso, type Db } from '../db.js';
import { generateClusterBrief } from '../llm.js';

/**
 * Cluster-level briefs: where per-article briefs cover one outlet's take,
 * a cluster brief merges every source's coverage of the event into a single
 * post. (Re)generated whenever a cluster has more articles than its stored
 * brief was written from — so new coverage and cluster merges both refresh
 * it. Single-article clusters keep using the article's own brief.
 */
export async function refreshClusterBriefs(
  db: Db,
  opts: { limit?: number; generate?: typeof generateClusterBrief } = {}
): Promise<number> {
  const limit = opts.limit ?? 10;
  const generate = opts.generate ?? generateClusterBrief;
  const pending = await db.query<{ id: number; n: number }>(
    `SELECT c.id, COUNT(a.id)::int AS n
     FROM clusters c JOIN articles a ON a.cluster_id = c.id
     GROUP BY c.id
     HAVING COUNT(a.id) >= 2 AND COUNT(a.id) > COALESCE(c.brief_article_count, 0)
     ORDER BY MAX(a.published_at) DESC
     LIMIT $1`,
    [limit]
  );
  let done = 0;
  for (const cluster of pending) {
    // Richest article first — its language sets the brief's language,
    // matching the article the feed shows for this cluster.
    const articles = await db.query<{ title: string; brief: string | null; summary: string | null; lang: string }>(
      `SELECT title, brief, summary, lang FROM articles WHERE cluster_id = $1
       ORDER BY LENGTH(COALESCE(content_text, '')) DESC, published_at DESC LIMIT 4`,
      [cluster.id]
    );
    if (articles.length < 2) continue;
    const brief = await generate(
      articles.map((a) => ({ title: a.title, gist: a.brief ?? a.summary })),
      articles[0].lang
    );
    if (!brief) continue; // LLM failure — retried next run
    await db.query(
      'UPDATE clusters SET brief = $1, brief_at = $2, brief_article_count = $3 WHERE id = $4',
      [brief, nowIso(), cluster.n, cluster.id]
    );
    done++;
  }
  return done;
}
