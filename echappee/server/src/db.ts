import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export type DB = Database.Database;

let db: DB | null = null;

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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  guid TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  excerpt TEXT,
  content_html TEXT,
  content_text TEXT,
  image_url TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  category TEXT NOT NULL DEFAULT 'other',
  summary TEXT,
  cluster_id INTEGER REFERENCES clusters(id),
  enriched_at TEXT,
  read_at TEXT,
  UNIQUE(source_key, guid)
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);

CREATE TABLE IF NOT EXISTS mutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('term','source','category')),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(kind, value)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function getDb(): DB {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/** For tests: an isolated in-memory database with the same schema. */
export function createMemoryDb(): DB {
  const mem = new Database(':memory:');
  mem.pragma('foreign_keys = ON');
  mem.exec(SCHEMA);
  return mem;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
