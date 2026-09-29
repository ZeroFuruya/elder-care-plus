import * as SQLite from 'expo-sqlite';

/**
 * Local store (expo-sqlite). Supabase is authoritative for every record; this
 * database holds only the Sprint 4 offline dose outbox and the legacy fallback
 * tables the tagged demo build still reads (docs/specs/sprint-1b.md).
 *
 * The legacy `doses` table is no longer reachable from any screen; the outbox is
 * the only table this app writes.
 */
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase();
  return databasePromise;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync('eldercare.db');
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync(SCHEMA);
  return database;
}

const SCHEMA = `
-- Legacy tables. Identity and care links moved to Supabase (RLS-scoped) in
-- Sprint 1b; these survive only because the fallback tag's demo build reads
-- them. The users role CHECK predates the third (family member) role and must
-- not be copied into anything new.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('caregiver', 'elder')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS care_links (
  caregiver_id TEXT NOT NULL,
  elder_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (caregiver_id, elder_id)
);

CREATE TABLE IF NOT EXISTS doses (
  id TEXT PRIMARY KEY NOT NULL,
  elder_id TEXT NOT NULL,
  medicine TEXT NOT NULL,
  strength TEXT NOT NULL,
  instructions TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due', 'taken', 'missed')),
  taken_at TEXT,
  FOREIGN KEY (elder_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS doses_by_elder_time ON doses (elder_id, scheduled_at);

-- Sprint 4 offline outbox (docs/specs/sprint-4.md, "Offline outbox"). Only a
-- dose that already exists on the server can be queued, so a queued row always
-- names a real dose event. It is cleared on every terminal server outcome and
-- retried only on a network failure.
CREATE TABLE IF NOT EXISTS dose_outbox (
  dose_event_id TEXT PRIMARY KEY NOT NULL,
  client_key TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
`;
