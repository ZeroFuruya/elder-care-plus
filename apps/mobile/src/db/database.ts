import * as SQLite from 'expo-sqlite';

/**
 * Local database (expo-sqlite). The professor's brief allows "a local database or a cloud
 * database"; this is the local one, chosen because it needs no network, no Docker and no
 * credentials, so a live demo cannot fail on connectivity.
 *
 * Swapping to Supabase later means replacing the functions in `db/users.ts` and `db/doses.ts`
 * and adding RLS — the screens do not change.
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
`;
