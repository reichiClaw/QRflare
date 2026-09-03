/**
 * D1 access with a self-creating schema. There is no migration step: the
 * statements are idempotent and run once per isolate on first use, so a fresh
 * deployment works the moment the (auto-provisioned) database exists.
 */
import type { Env } from './env';
import { HttpError } from './http';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (
     key        TEXT PRIMARY KEY,
     value      TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS links (
     code        TEXT PRIMARY KEY,
     destination TEXT NOT NULL,
     label       TEXT,
     enabled     INTEGER NOT NULL DEFAULT 1,
     expires_at  TEXT,
     max_scans   INTEGER,
     scan_count  INTEGER NOT NULL DEFAULT 0,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS scan_daily (
     code  TEXT NOT NULL,
     day   TEXT NOT NULL,
     count INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (code, day)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at DESC)`,
];

let ready = new WeakMap<D1Database, Promise<void>>();

export function hasStorage(env: Env): env is Env & { DB: D1Database } {
  return env.DB !== undefined;
}

/** Returns the database with the schema guaranteed to exist. */
export async function getDb(env: Env): Promise<D1Database> {
  if (!hasStorage(env)) {
    throw new HttpError(
      503,
      'STORAGE_UNAVAILABLE',
      'This deployment has no D1 database bound, so settings and links cannot be stored.',
    );
  }
  const db = env.DB;
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => undefined);
    ready.set(db, pending);
    pending.catch(() => ready.delete(db));
  }
  await pending;
  return db;
}

/** Test hook: forget that schemas were created (isolated test storage is reset between tests). */
export function resetSchemaCache(): void {
  ready = new WeakMap();
}

export async function kvGet(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM kv WHERE key = ?1').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function kvSet(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    )
    .bind(key, value, new Date().toISOString())
    .run();
}

export async function kvDelete(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM kv WHERE key = ?1').bind(key).run();
}
