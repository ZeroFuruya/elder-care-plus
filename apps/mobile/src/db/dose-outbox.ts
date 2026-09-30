import { randomUUID } from 'expo-crypto';

import { getDatabase } from './database';

/**
 * The Sprint 4 offline outbox (docs/specs/sprint-4.md, "Offline outbox").
 *
 * A dose confirmation the device could not deliver is written here, keyed by the
 * dose event so a double tap can never queue twice. The client shows `Pending
 * sync` while a row exists and flushes it with the same `client_key`. The server
 * is still the only place a confirmation becomes real; this table just remembers
 * the attempt.
 */

export interface DoseOutboxEntry {
  doseEventId: string;
  clientKey: string;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

interface OutboxRow {
  dose_event_id: string;
  client_key: string;
  queued_at: string;
  attempts: number;
  last_error: string | null;
}

function toEntry(row: OutboxRow): DoseOutboxEntry {
  return {
    doseEventId: row.dose_event_id,
    clientKey: row.client_key,
    queuedAt: row.queued_at,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

/**
 * Queues a confirmation and returns the client key that identifies this
 * attempt. Re-queueing the same dose keeps the original key, so the server can
 * still recognise a retry as the same attempt.
 */
export async function queueDoseConfirmation(doseEventId: string): Promise<string> {
  const database = await getDatabase();
  const clientKey = randomUUID();

  await database.runAsync(
    `INSERT INTO dose_outbox (dose_event_id, client_key, queued_at, attempts, last_error)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT (dose_event_id) DO NOTHING`,
    doseEventId,
    clientKey,
    new Date().toISOString(),
  );

  const row = await database.getFirstAsync<{ client_key: string }>(
    'SELECT client_key FROM dose_outbox WHERE dose_event_id = ? LIMIT 1',
    doseEventId,
  );
  return row?.client_key ?? clientKey;
}

/** Removes a queued dose — every terminal server outcome ends the queue entry. */
export async function clearQueuedDose(doseEventId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM dose_outbox WHERE dose_event_id = ?', doseEventId);
}

/** Records a failed flush attempt without dropping the row. */
export async function recordOutboxFailure(doseEventId: string, message: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE dose_outbox
        SET attempts = attempts + 1, last_error = ?
      WHERE dose_event_id = ?`,
    message.slice(0, 200),
    doseEventId,
  );
}

/** The whole queue, oldest first. */
export async function listDoseOutbox(): Promise<DoseOutboxEntry[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<OutboxRow>(
    'SELECT * FROM dose_outbox ORDER BY queued_at ASC',
  );
  return rows.map(toEntry);
}

/** The ids of doses showing `Pending sync`, as a set for a list read. */
export async function listQueuedDoseEventIds(): Promise<string[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ dose_event_id: string }>(
    'SELECT dose_event_id FROM dose_outbox',
  );
  return rows.map((row) => row.dose_event_id);
}
