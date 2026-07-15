import { config } from './config.js';

/**
 * Minimal async DB interface with two backends:
 *  - Postgres (`DATABASE_URL` set) — production: Neon/Vercel, GitHub Actions scraper.
 *  - PGlite (embedded WASM Postgres) — local dev (persisted to data/pg) and tests.
 * All SQL is written once, in Postgres dialect with $n placeholders.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export const nowIso = (): string => new Date().toISOString();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS source_state (
  source_key TEXT PRIMARY KEY,
  working_feed_url TEXT,
  last_run_at TEXT,
  last_ok_at TEXT,
  last_error TEXT,
  articles_total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clusters (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_key TEXT NOT NULL,
  guid TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  excerpt TEXT,
  content_html TEXT,
  content_text TEXT,
  image_url TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  category TEXT NOT NULL DEFAULT 'other',
  summary TEXT,
  cluster_id INTEGER REFERENCES clusters(id),
  enriched_at TEXT,
  riders_at TEXT,
  brief TEXT,
  importance INTEGER,
  read_at TEXT,
  UNIQUE(source_key, guid)
);

ALTER TABLE articles ADD COLUMN IF NOT EXISTS riders_at TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS brief TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS importance INTEGER;

CREATE TABLE IF NOT EXISTS races (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  race_key TEXT NOT NULL,
  race_name TEXT NOT NULL,
  stage_label TEXT NOT NULL,
  race_date TEXT,
  UNIQUE(race_key, stage_label)
);

ALTER TABLE articles ADD COLUMN IF NOT EXISTS race_id INTEGER REFERENCES races(id);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS race_kind TEXT;
CREATE INDEX IF NOT EXISTS idx_articles_race ON articles(race_id);

CREATE TABLE IF NOT EXISTS watch_guides (
  race_id INTEGER PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL,
  article_count INTEGER NOT NULL,
  guide TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_riders (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  rider_key TEXT NOT NULL,
  rider_name TEXT NOT NULL,
  PRIMARY KEY (article_id, rider_key)
);

CREATE INDEX IF NOT EXISTS idx_article_riders_key ON article_riders(rider_key);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);

CREATE TABLE IF NOT EXISTS mutes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('term','source','category')),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(kind, value)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

class PostgresDb implements Db {
  private sql: import('postgres').Sql;

  constructor(sql: import('postgres').Sql) {
    this.sql = sql;
  }

  static async create(url: string): Promise<PostgresDb> {
    const { default: postgres } = await import('postgres');
    // max 1: serverless functions and the CI scraper are single-threaded users.
    const sql = postgres(url, { max: 1 });
    await sql.unsafe(SCHEMA).simple();
    return new PostgresDb(sql);
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.sql.unsafe(text, params as never[]);
    return rows as unknown as T[];
  }

  async close(): Promise<void> {
    // Bounded shutdown — a stuck connection must not keep the process alive.
    await this.sql.end({ timeout: 5 });
  }
}

type PGliteInstance = {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
  close(): Promise<void>;
};

class PgliteDb implements Db {
  constructor(private pg: PGliteInstance) {}

  static async create(dataDir?: string): Promise<PgliteDb> {
    const { PGlite } = await import('@electric-sql/pglite');
    if (dataDir) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(dataDir, { recursive: true });
    }
    const pg = (dataDir ? new PGlite(dataDir) : new PGlite()) as unknown as PGliteInstance;
    await pg.exec(SCHEMA);
    return new PgliteDb(pg);
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pg.query<T>(text, params);
    return res.rows;
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

let singleton: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!singleton) {
    singleton = (
      config.databaseUrl
        ? PostgresDb.create(config.databaseUrl)
        : PgliteDb.create(config.dataDir)
    ).catch((err) => {
      // Don't pin a transient failure (e.g. a sleeping Neon instance timing
      // out on first connect) — let the next caller retry from scratch.
      singleton = null;
      throw err;
    });
  }
  return singleton;
}

/** For tests: an isolated in-memory database with the same schema. */
export function createMemoryDb(): Promise<Db> {
  return PgliteDb.create();
}
