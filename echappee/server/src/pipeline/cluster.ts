import { nowIso, type Db } from '../db.js';

export interface ClusterCandidate {
  id: number;
  title: string;
}

/** Clusters that recently got articles — the only ones worth matching against. */
export async function recentClusters(db: Db, hours = 72, limit = 40): Promise<ClusterCandidate[]> {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  return db.query<ClusterCandidate>(
    `SELECT id, title FROM clusters WHERE updated_at >= $1 ORDER BY updated_at DESC LIMIT $2`,
    [cutoff, limit]
  );
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'with', 'after', 'his', 'her',
  'de', 'het', 'een', 'van', 'op', 'na', 'voor', 'met', 'en', 'bij', 'om', 'naar',
]);

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

/**
 * No-LLM fallback: match a title against recent clusters by token overlap.
 * The threshold is deliberately strict — a wrong merge is worse than a
 * duplicate card.
 */
export function matchClusterByTitle(
  title: string,
  candidates: ClusterCandidate[]
): number | null {
  const a = tokens(title);
  if (a.size === 0) return null;
  let best: { id: number; score: number } | null = null;
  for (const c of candidates) {
    const b = tokens(c.title);
    if (b.size === 0) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const score = inter / Math.min(a.size, b.size);
    if (score >= 0.5 && inter >= 3 && (!best || score > best.score)) {
      best = { id: c.id, score };
    }
  }
  return best?.id ?? null;
}

export async function createCluster(db: Db, title: string): Promise<number> {
  const now = nowIso();
  const rows = await db.query<{ id: number }>(
    'INSERT INTO clusters (title, created_at, updated_at) VALUES ($1, $2, $2) RETURNING id',
    [title, now]
  );
  return rows[0].id;
}

export async function touchCluster(db: Db, id: number): Promise<void> {
  await db.query('UPDATE clusters SET updated_at = $1 WHERE id = $2', [nowIso(), id]);
}
