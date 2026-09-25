import { randomUUID } from 'expo-crypto';

import { deriveDoseStatus, type DoseStatus } from '@eldercare/shared';

import { getDatabase } from './database';

export interface DoseView {
  id: string;
  elderId: string;
  medicine: string;
  strength: string;
  instructions: string;
  scheduledAt: string;
  takenAt: string | null;
  /** Computed at read time — never trust a stored status. */
  status: DoseStatus;
}

interface DoseRow {
  id: string;
  elder_id: string;
  medicine: string;
  strength: string;
  instructions: string;
  scheduled_at: string;
  taken_at: string | null;
}

function toView(row: DoseRow, now: Date): DoseView {
  return {
    id: row.id,
    elderId: row.elder_id,
    medicine: row.medicine,
    strength: row.strength,
    instructions: row.instructions,
    scheduledAt: row.scheduled_at,
    takenAt: row.taken_at,
    status: deriveDoseStatus({ scheduledAt: row.scheduled_at, takenAt: row.taken_at }, now),
  };
}

export async function listDoses(
  elderId: string,
  options: { from?: Date; to?: Date; now?: Date } = {},
): Promise<DoseView[]> {
  const database = await getDatabase();
  const now = options.now ?? new Date();
  const from = (options.from ?? new Date(0)).toISOString();
  const to = (options.to ?? new Date('2999-12-31T00:00:00.000Z')).toISOString();

  const rows = await database.getAllAsync<DoseRow>(
    `SELECT * FROM doses
      WHERE elder_id = ? AND scheduled_at >= ? AND scheduled_at <= ?
      ORDER BY scheduled_at ASC`,
    elderId,
    from,
    to,
  );

  return rows.map((row) => toView(row, now));
}

export async function listDosesForDay(elderId: string, day: Date, now?: Date): Promise<DoseView[]> {
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(day);
  to.setHours(23, 59, 59, 999);
  return listDoses(elderId, { from, to, now });
}

export interface AdherenceSummary {
  taken: number;
  missed: number;
  due: number;
  upcoming: number;
  /** Percentage of past doses that were confirmed (0 when there are none). */
  percent: number;
}

export function summarise(doses: DoseView[]): AdherenceSummary {
  const taken = doses.filter((dose) => dose.status === 'taken').length;
  const missed = doses.filter((dose) => dose.status === 'missed').length;
  const due = doses.filter((dose) => dose.status === 'due').length;
  const upcoming = doses.filter((dose) => dose.status === 'upcoming').length;
  const settled = taken + missed;

  return {
    taken,
    missed,
    due,
    upcoming,
    percent: settled === 0 ? 0 : Math.round((taken / settled) * 100),
  };
}

/**
 * Records a confirmation. Idempotent by design: the `taken_at IS NULL` guard means a retry
 * (or a double tap) cannot overwrite the original timestamp or create a second event.
 */
export async function confirmDose(
  doseId: string,
  elderId: string,
  now = new Date(),
): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `UPDATE doses SET status = 'taken', taken_at = ?
      WHERE id = ? AND elder_id = ? AND taken_at IS NULL`,
    now.toISOString(),
    doseId,
    elderId,
  );
  return result.changes > 0;
}

export interface NewDose {
  elderId: string;
  medicine: string;
  strength: string;
  instructions: string;
  scheduledAt: Date;
}

/**
 * Schedules a dose for the elder.
 *
 * This is the caregiver's write path; the elder's only write is `confirmDose`. `status` is stored
 * as `upcoming` because the real state is derived from `scheduled_at` at read time
 * (`deriveDoseStatus`), so a row can never show a stale state.
 */
export async function createDose(dose: NewDose): Promise<string> {
  const database = await getDatabase();
  const id = randomUUID();

  await database.runAsync(
    `INSERT INTO doses (id, elder_id, medicine, strength, instructions, scheduled_at, status, taken_at)
     VALUES (?, ?, ?, ?, ?, ?, 'upcoming', NULL)`,
    id,
    dose.elderId,
    dose.medicine,
    dose.strength,
    dose.instructions,
    dose.scheduledAt.toISOString(),
  );

  return id;
}

export async function getDoseById(doseId: string, now = new Date()): Promise<DoseView | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<DoseRow>(
    'SELECT * FROM doses WHERE id = ? LIMIT 1',
    doseId,
  );
  return row ? toView(row, now) : null;
}

/** Most recent confirmations, newest first — the caregiver's activity feed. */
export async function listRecentConfirmations(elderId: string, limit = 5): Promise<DoseView[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<DoseRow>(
    `SELECT * FROM doses
      WHERE elder_id = ? AND taken_at IS NOT NULL
      ORDER BY taken_at DESC
      LIMIT ?`,
    elderId,
    limit,
  );
  return rows.map((row) => toView(row, new Date()));
}

/** Distinct medicines with the dose that matters most for each: soonest pending, else most recent. */
export async function listMedicines(
  elderId: string,
  now = new Date(),
): Promise<{ medicine: string; strength: string; instructions: string; next: DoseView }[]> {
  const doses = await listDoses(elderId, { now });

  // Due first, then upcoming, then anything already settled.
  const rank = (dose: DoseView) => (dose.status === 'due' ? 0 : dose.status === 'upcoming' ? 1 : 2);

  const isBetter = (candidate: DoseView, current: DoseView) => {
    const candidateRank = rank(candidate);
    const currentRank = rank(current);
    if (candidateRank !== currentRank) return candidateRank < currentRank;
    // Inside the settled bucket the most recent dose is the informative one.
    return candidateRank === 2
      ? candidate.scheduledAt > current.scheduledAt
      : candidate.scheduledAt < current.scheduledAt;
  };

  const byMedicine = new Map<string, DoseView>();

  for (const dose of doses) {
    const key = `${dose.medicine}|${dose.strength}`;
    const current = byMedicine.get(key);
    if (!current || isBetter(dose, current)) byMedicine.set(key, dose);
  }

  return [...byMedicine.values()]
    .map((next) => ({
      medicine: next.medicine,
      strength: next.strength,
      instructions: next.instructions,
      next,
    }))
    .sort((a, b) => a.medicine.localeCompare(b.medicine));
}
