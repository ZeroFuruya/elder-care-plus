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
 * Seeds *today's* dose list, once, if the day is empty.
 *
 * Unlike the earlier wipe-and-reseed version this never deletes anything, so confirmations and any
 * doses the caregiver has added survive a restart. `loadDemoSafeDay` is what keeps a due dose on
 * screen.
 *
 * Demo scaffolding: delete with `loadDemoSafeDay` when real scheduling lands (Sprint 4).
 */
export async function ensureDemoSchedule(elderId: string, now: Date = new Date()): Promise<void> {
  const database = await getDatabase();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const existing = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM doses
      WHERE elder_id = ? AND scheduled_at >= ? AND scheduled_at <= ?`,
    elderId,
    startOfToday.toISOString(),
    endOfToday.toISOString(),
  );
  if ((existing?.total ?? 0) > 0) return;

  const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

  // One already-confirmed dose so the caregiver report is never empty ...
  await insertDose({
    elderId,
    ...AMLODIPINE,
    scheduledAt: minutes(-120),
    takenAt: minutes(-115),
  });
  // ... one outside the grace period -> derives as Missed (the "needs attention" row) ...
  await insertDose({ elderId, ...METFORMIN, scheduledAt: minutes(-45) });
  // ... one inside the grace period -> derives as Due; the dose the elder confirms on stage ...
  await insertDose({ elderId, ...AMLODIPINE, scheduledAt: minutes(-5) });
  // ... and one in the future -> derives as Upcoming.
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

/** Adds one fresh due dose. Never deletes, so a schedule the caregiver has built is left alone. */
async function insertDueDose(elderId: string, now: Date): Promise<void> {
  await insertDose({
    elderId,
    ...AMLODIPINE,
    scheduledAt: new Date(now.getTime() - 5 * 60_000),
  });
}

/**
 * Today's doses for the elder home screen, with one piece of demo scaffolding: if nothing is
 * currently *due*, a due dose is added, so the confirmation loop can be repeated without
 * restarting the app. Nothing is removed. Delete with `ensureDemoSchedule` when Sprint 4 lands.
 */
export async function loadDemoSafeDay(
  elderId: string,
  now: Date = new Date(),
): Promise<DoseView[]> {
  const doses = await listDosesForDay(elderId, now);
  if (doses.some((dose) => dose.status === 'due')) return doses;

  await insertDueDose(elderId, now);
  return listDosesForDay(elderId, now);
}
