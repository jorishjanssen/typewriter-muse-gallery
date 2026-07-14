import type { DB } from '../db.js';

export interface ClusterCandidate {
  id: number;
  title: string;
}

/** Clusters that recently got articles — the only ones worth matching against. */
export function recentClusters(db: DB, hours = 72, limit = 40): ClusterCandidate[] {
  return db
    .prepare(
      `SELECT c.id, c.title FROM clusters c
       WHERE c.updated_at >= datetime('now', ?)
       ORDER BY c.updated_at DESC LIMIT ?`
    )
    .all(`-${hours} hours`, limit) as ClusterCandidate[];
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'with', 'after', 'his', 'her',
  'de', 'het', 'een', 'van', 'in', 'op', 'na', 'voor', 'met', 'en', 'bij', 'om', 'naar',
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

export function createCluster(db: DB, title: string): number {
  const res = db.prepare('INSERT INTO clusters (title) VALUES (?)').run(title);
  return Number(res.lastInsertRowid);
}

export function touchCluster(db: DB, id: number): void {
  db.prepare(
    `UPDATE clusters SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(id);
}
