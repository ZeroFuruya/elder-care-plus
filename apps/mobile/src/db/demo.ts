import { randomUUID } from 'expo-crypto';

import { linkCaregiverToElder } from './care-links';
import { getDatabase } from './database';
import { listDosesForDay, type DoseView } from './doses';
import { createUser, findUserByEmail, type PublicUser } from './users';

/**
 * Demo fixtures and demo scaffolding.
 *
 * Everything here is synthetic. This module exists so the delivered build opens with two
 * working accounts and a populated day, which is what the class checking needs. When real
 * scheduling lands (Sprint 4) `ensureDemoSchedule` is deleted; `ensureDemoAccounts` is the
 * seed that a fresh database always gets.
 */

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_CAREGIVER = {
  name: 'Maria Santos',
  email: 'maria@eldercare.app',
  password: DEMO_PASSWORD,
  role: 'caregiver',
} as const;

export const DEMO_ELDER = {
  name: 'Ana Reyes',
  email: 'ana@eldercare.app',
  password: DEMO_PASSWORD,
  role: 'elder',
} as const;

/** The two medicines in the synthetic schedule. */
const AMLODIPINE = {
  medicine: 'Amlodipine',
  strength: '5 mg',
  instructions: 'One tablet with water after breakfast.',
} as const;

const METFORMIN = {
  medicine: 'Metformin',
  strength: '500 mg',
  instructions: 'One tablet with food.',
} as const;

async function ensureUser(account: {
  name: string;
  email: string;
  password: string;
  role: 'caregiver' | 'elder';
}): Promise<PublicUser> {
  const existing = await findUserByEmail(account.email);
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      role: existing.role,
      createdAt: existing.createdAt,
    };
  }
  return createUser(account);
}

interface InsertDose {
  elderId: string;
  medicine: string;
  strength: string;
  instructions: string;
  scheduledAt: Date;
  takenAt?: Date | null;
}

async function insertDose(dose: InsertDose): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO doses (id, elder_id, medicine, strength, instructions, scheduled_at, status, taken_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    dose.elderId,
    dose.medicine,
    dose.strength,
    dose.instructions,
    dose.scheduledAt.toISOString(),
    dose.takenAt ? 'taken' : 'upcoming',
    dose.takenAt ? dose.takenAt.toISOString() : null,
  );
}

/** Six days of past adherence so the caregiver report is not empty on first launch. */
const HISTORY: {
  daysAgo: number;
  hour: number;
  taken: boolean;
  medicine: typeof AMLODIPINE | typeof METFORMIN;
}[] = [
  { daysAgo: 1, hour: 8, taken: true, medicine: AMLODIPINE },
  { daysAgo: 1, hour: 20, taken: true, medicine: METFORMIN },
  { daysAgo: 2, hour: 8, taken: true, medicine: AMLODIPINE },
  { daysAgo: 2, hour: 20, taken: false, medicine: METFORMIN },
  { daysAgo: 3, hour: 8, taken: true, medicine: AMLODIPINE },
  { daysAgo: 3, hour: 20, taken: true, medicine: METFORMIN },
  { daysAgo: 4, hour: 8, taken: false, medicine: AMLODIPINE },
  { daysAgo: 4, hour: 20, taken: true, medicine: METFORMIN },
  { daysAgo: 5, hour: 8, taken: true, medicine: AMLODIPINE },
  { daysAgo: 5, hour: 20, taken: true, medicine: METFORMIN },
  { daysAgo: 6, hour: 8, taken: true, medicine: AMLODIPINE },
  { daysAgo: 6, hour: 20, taken: true, medicine: METFORMIN },
];

async function ensureHistory(elderId: string, now: Date): Promise<void> {
  const database = await getDatabase();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const existing = await database.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM doses WHERE elder_id = ? AND scheduled_at < ?',
    elderId,
    startOfToday.toISOString(),
  );
  if ((existing?.total ?? 0) > 0) return;

  for (const entry of HISTORY) {
    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() - entry.daysAgo);
    scheduledAt.setHours(entry.hour, 0, 0, 0);
    const takenAt = new Date(scheduledAt.getTime() + 4 * 60_000);

    await insertDose({
      elderId,
      ...entry.medicine,
      scheduledAt,
      takenAt: entry.taken ? takenAt : null,
    });
  }
}

/**
 * Rebuilds *today's unconfirmed* doses so that a dose is always due when the app is opened —
 * a live demo cannot depend on the clock. Confirmations are never deleted, so the cross-role
 * story (elder confirms, caregiver sees it) survives a restart.
 */
export async function ensureDemoSchedule(elderId: string, now: Date = new Date()): Promise<void> {
  const database = await getDatabase();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  await database.runAsync(
    `DELETE FROM doses
      WHERE elder_id = ? AND taken_at IS NULL AND scheduled_at >= ? AND scheduled_at <= ?`,
    elderId,
    startOfToday.toISOString(),
    endOfToday.toISOString(),
  );

  const takenToday = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM doses
      WHERE elder_id = ? AND taken_at IS NOT NULL AND scheduled_at >= ?`,
    elderId,
    startOfToday.toISOString(),
  );

  const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

  if ((takenToday?.total ?? 0) === 0) {
    await insertDose({
      elderId,
      ...AMLODIPINE,
      scheduledAt: minutes(-120),
      takenAt: minutes(-115),
    });
  }

  // Outside the grace period -> derives as Missed (the caregiver's "needs attention" row).
  await insertDose({ elderId, ...METFORMIN, scheduledAt: minutes(-45) });
  // Inside the grace period -> derives as Due; this is the dose the elder confirms on stage.
  await insertDose({ elderId, ...AMLODIPINE, scheduledAt: minutes(-5) });
  // Future -> derives as Upcoming.
  await insertDose({ elderId, ...METFORMIN, scheduledAt: minutes(180) });
}

export interface DemoIds {
  caregiverId: string;
  elderId: string;
}

export async function ensureDemoData(now: Date = new Date()): Promise<DemoIds> {
  const caregiver = await ensureUser(DEMO_CAREGIVER);
  const elder = await ensureUser(DEMO_ELDER);

  await linkCaregiverToElder(caregiver.id, elder.id);
  await ensureHistory(elder.id, now);
  await ensureDemoSchedule(elder.id, now);

  return { caregiverId: caregiver.id, elderId: elder.id };
}

/**
 * Today's doses for the elder home screen, with one piece of demo scaffolding: if the day has
 * nothing pending (everything taken or missed), the schedule is rebuilt so a dose is due again.
 * This is what stops a live demo from dead-ending on the clock. Delete with `ensureDemoSchedule`.
 */
export async function loadDemoSafeDay(
  elderId: string,
  now: Date = new Date(),
): Promise<DoseView[]> {
  const doses = await listDosesForDay(elderId, now);
  const hasPending = doses.some((dose) => dose.status === 'due' || dose.status === 'upcoming');
  if (hasPending) return doses;

  await ensureDemoSchedule(elderId, now);
  return listDosesForDay(elderId, now);
}
