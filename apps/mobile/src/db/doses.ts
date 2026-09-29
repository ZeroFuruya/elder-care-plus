import { deriveDoseStatus, type DoseStatus, type SyncState } from '@eldercare/shared';

import { addDays, toIsoDay } from '@/lib/format';
import { getSupabase } from '@/supabase/client';

import {
  clearQueuedDose,
  listDoseOutbox,
  listQueuedDoseEventIds,
  queueDoseConfirmation,
  recordOutboxFailure,
} from './dose-outbox';
import { listMedications, type Medication } from './medications';

/**
 * Dose-event access for the Supabase-backed app (docs/specs/sprint-4.md).
 *
 * Reads are RLS-scoped selects: the server decides whether this account may see
 * the elder's occurrences. The elder's confirmation is the guarded
 * `confirm_dose` RPC and nothing else. Generation goes through the authorized,
 * window-capped `ensure_dose_events` RPC — the client never inserts a row.
 *
 * Schedules/batches carry no elder column, so the medicine name, strength and
 * instructions are joined in memory from `listMedications`, the same pattern the
 * Sprint 3 plan uses. That keeps every query on the `.eq`/`.in` filters this
 * codebase already proves out, rather than relying on PostgREST embedded
 * resources.
 */

/** `dose_events` columns that survive a plan edit (snapshotted at generation). */
const DOSE_COLUMNS =
  'id, elder_id, medication_id, schedule_id, scheduled_at, scheduled_local_date, dose_quantity, dose_unit, grace_minutes, timezone, taken_at, missed_at, cancelled_at, confirmed_by, client_key' as const;

interface DoseEventRow {
  id: string;
  elder_id: string;
  medication_id: string;
  schedule_id: string;
  scheduled_at: string;
  scheduled_local_date: string;
  dose_quantity: number | string;
  dose_unit: string;
  grace_minutes: number;
  timezone: string;
  taken_at: string | null;
  missed_at: string | null;
  cancelled_at: string | null;
  confirmed_by: string | null;
  client_key: string | null;
}

export interface DoseView {
  id: string;
  elderId: string;
  medicationId: string;
  medicine: string;
  strength: string;
  instructions: string;
  doseQuantity: number;
  doseUnit: string;
  scheduledAt: string;
  takenAt: string | null;
  missedAt: string | null;
  graceMinutes: number;
  /** Derived from the stored facts and the current clock — never stored. */
  status: DoseStatus;
  /** `pending` while an offline confirmation is still queued on this device. */
  syncState: SyncState;
}

function toView(
  row: DoseEventRow,
  medication: Medication | undefined,
  now: Date,
  queued: ReadonlySet<string>,
): DoseView {
  return {
    id: row.id,
    elderId: row.elder_id,
    medicationId: row.medication_id,
    medicine: medication?.name ?? '—',
    strength: medication?.strength ?? '',
    instructions: medication?.instructions ?? '',
    doseQuantity: Number(row.dose_quantity),
    doseUnit: row.dose_unit,
    scheduledAt: row.scheduled_at,
    takenAt: row.taken_at,
    missedAt: row.missed_at,
    graceMinutes: row.grace_minutes,
    status: deriveDoseStatus(
      { scheduledAt: row.scheduled_at, takenAt: row.taken_at, missedAt: row.missed_at },
      now,
      row.grace_minutes,
    ),
    syncState: queued.has(row.id) ? 'pending' : 'synced',
  };
}

async function hydrate(rows: DoseEventRow[], elderId: string, now: Date): Promise<DoseView[]> {
  if (rows.length === 0) return [];

  const [medications, queuedIds] = await Promise.all([
    listMedications(elderId),
    listQueuedDoseEventIds(),
  ]);
  const byId = new Map(medications.map((medication) => [medication.id, medication]));
  const queued = new Set(queuedIds);

  return rows.map((row) => toView(row, byId.get(row.medication_id), now, queued));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The elder's occurrences in a time window, oldest first. Cancelled occurrences
 * (a plan edit retired them) are excluded: they are not real doses.
 */
export async function listDoses(
  elderId: string,
  options: { from?: Date; to?: Date; now?: Date } = {},
): Promise<DoseView[]> {
  const now = options.now ?? new Date();
  const from = (options.from ?? new Date(0)).toISOString();
  const to = (options.to ?? new Date('2999-12-31T00:00:00.000Z')).toISOString();

  const { data, error } = await getSupabase()
    .from('dose_events')
    .select(DOSE_COLUMNS)
    .eq('elder_id', elderId)
    .is('cancelled_at', null)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true })
    .returns<DoseEventRow[]>();

  if (error) throw new Error('Could not load the doses.');
  return hydrate(data, elderId, now);
}

/**
 * One local day. Filtering on `scheduled_local_date` uses the date the schedule's
 * own zone recorded at generation, so the day boundary is the elder's, not the
 * device's.
 */
export async function listDosesForDay(
  elderId: string,
  day: Date,
  now: Date = new Date(),
): Promise<DoseView[]> {
  const { data, error } = await getSupabase()
    .from('dose_events')
    .select(DOSE_COLUMNS)
    .eq('elder_id', elderId)
    .eq('scheduled_local_date', toIsoDay(day))
    .is('cancelled_at', null)
    .order('scheduled_at', { ascending: true })
    .returns<DoseEventRow[]>();

  if (error) throw new Error('Could not load the doses.');
  return hydrate(data, elderId, now);
}

/** One occurrence with the medicine joined in, or `null` when RLS hides it. */
export async function getDoseById(
  doseEventId: string,
  now: Date = new Date(),
): Promise<DoseView | null> {
  const { data, error } = await getSupabase()
    .from('dose_events')
    .select(DOSE_COLUMNS)
    .eq('id', doseEventId)
    .maybeSingle<DoseEventRow>();

  if (error) throw new Error('Could not load the dose.');
  if (!data) return null;

  const views = await hydrate([data], data.elder_id, now);
  return views[0] ?? null;
}

/** Most recent confirmations, newest first — the caregiver's activity feed. */
export async function listRecentConfirmations(elderId: string, limit = 5): Promise<DoseView[]> {
  const { data, error } = await getSupabase()
    .from('dose_events')
    .select(DOSE_COLUMNS)
    .eq('elder_id', elderId)
    .is('cancelled_at', null)
    .not('taken_at', 'is', null)
    .order('taken_at', { ascending: false })
    .limit(limit)
    .returns<DoseEventRow[]>();

  if (error) throw new Error('Could not load the confirmations.');
  return hydrate(data, elderId, new Date());
}

export interface DoseStockOutcome {
  /** Negative for a decrement; the ledger stores signed deltas. */
  delta: number;
  reason: string;
  createdAt: string;
}

/**
 * The stock ledger row a confirmation produced, if any. A dose that could not
 * decrement (no batch, unit mismatch, insufficient, expired) has no row, which is
 * itself the honest answer: nothing left the shelf.
 */
export async function getDoseStockOutcome(doseEventId: string): Promise<DoseStockOutcome | null> {
  const { data, error } = await getSupabase()
    .from('inventory_transactions')
    .select('delta, reason, created_at')
    .eq('source_dose_event_id', doseEventId)
    .limit(1)
    .maybeSingle<{ delta: number | string; reason: string; created_at: string }>();

  if (error || !data) return null;
  return { delta: Number(data.delta), reason: data.reason, createdAt: data.created_at };
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

// ---------------------------------------------------------------------------
// Generation (authorized RPC)
// ---------------------------------------------------------------------------

/**
 * Creates any missing occurrences for the four-day window around today. The RPC
 * caps the window itself, so the client asks for the widest window it can use
 * and, if the server's own date sits on the far side of the device's, retries
 * with a window shifted one day. Both are inside the cap; generation is
 * idempotent, so a retry cannot duplicate a row.
 */
export async function ensureDoseEvents(elderId: string): Promise<number> {
  const today = new Date();
  const attempts: { from: string; to: string }[] = [
    { from: toIsoDay(addDays(today, -1)), to: toIsoDay(addDays(today, 2)) },
    { from: toIsoDay(today), to: toIsoDay(addDays(today, 3)) },
  ];

  let lastError: PostgrestError | null = null;

  for (const window of attempts) {
    const { data, error } = await getSupabase().rpc('ensure_dose_events', {
      p_elder_id: elderId,
      p_from: window.from,
      p_to: window.to,
    });

    if (!error) return typeof data === 'number' ? data : 0;
    if (!isWindowError(error)) throw doseReadError(error, 'Could not prepare today’s doses.');
    lastError = error;
  }

  throw doseReadError(lastError ?? { message: '' }, 'Could not prepare today’s doses.');
}

// ---------------------------------------------------------------------------
// Confirmation (guarded RPC + offline outbox)
// ---------------------------------------------------------------------------

interface PostgrestError {
  code?: string;
  message: string;
}

export type ConfirmStatus = 'taken' | 'missed' | 'cancelled' | 'upcoming';

export interface ConfirmOutcome {
  status: ConfirmStatus;
  duplicate: boolean;
  /** The stock outcome the server reported, or `null` for a queued offline attempt. */
  stock: string | null;
  /** True when the confirmation is queued locally and has not reached the server yet. */
  queued: boolean;
  takenAt: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

/** A delivery failure — the only case worth retrying. Everything else is terminal. */
export function isOfflineError(error: unknown): boolean {
  return /network|fetch|timed out|timeout|connection|offline|unreachable/i.test(
    errorMessage(error),
  );
}

function isWindowError(error: PostgrestError): boolean {
  return error.code === '23514';
}

export function doseReadError(error: PostgrestError, fallback: string): Error {
  if (error.code === '42501') return new Error('This dose is not available to you.');
  if (error.code === '23514') return new Error('Those dates are outside the allowed range.');
  return new Error(fallback);
}

interface RawConfirm {
  status?: string;
  duplicate?: boolean;
  stock?: string;
  taken_at?: string;
}

function normaliseStatus(value: string | undefined): ConfirmStatus {
  if (value === 'missed' || value === 'cancelled' || value === 'upcoming') return value;
  return 'taken';
}

async function callConfirmDose(
  doseEventId: string,
  clientKey: string | null,
): Promise<ConfirmOutcome> {
  const { data, error } = await getSupabase().rpc('confirm_dose', {
    p_dose_event_id: doseEventId,
    p_client_key: clientKey,
  });

  if (error) throw doseReadError(error, 'Could not record the confirmation.');

  const payload = (data ?? {}) as RawConfirm;
  return {
    status: normaliseStatus(payload.status),
    duplicate: payload.duplicate === true,
    stock: payload.stock ?? null,
    queued: false,
    takenAt: payload.taken_at ?? null,
  };
}

/**
 * Records the elder's confirmation.
 *
 * Online, the guarded RPC runs once and its terminal meaning is returned. If the
 * device cannot reach the server, the attempt is queued and reported as `taken`
 * with `queued: true`: the screen shows `Pending sync`, and the single
 * `(schedule_id, scheduled_at)` server anchor means the retry cannot create a
 * second confirmation.
 */
export async function markDoseTaken(doseEventId: string): Promise<ConfirmOutcome> {
  try {
    const outcome = await callConfirmDose(doseEventId, null);
    await clearQueuedDose(doseEventId).catch(() => undefined);
    return outcome;
  } catch (error) {
    if (!isOfflineError(error)) {
      // A terminal server refusal (for example 42501): nothing is retryable.
      await clearQueuedDose(doseEventId).catch(() => undefined);
      throw error;
    }

    await queueDoseConfirmation(doseEventId);
    return {
      status: 'taken',
      duplicate: false,
      stock: null,
      queued: true,
      takenAt: new Date().toISOString(),
    };
  }
}

/**
 * Delivers every queued confirmation, oldest first. A network failure stops the
 * flush (the device is still offline); a terminal outcome clears the row. Returns
 * the number of rows still queued afterwards.
 */
export async function flushDoseOutbox(): Promise<number> {
  const entries = await listDoseOutbox();

  for (const entry of entries) {
    try {
      await callConfirmDose(entry.doseEventId, entry.clientKey);
      await clearQueuedDose(entry.doseEventId);
    } catch (error) {
      if (isOfflineError(error)) {
        await recordOutboxFailure(entry.doseEventId, errorMessage(error));
        return entries.length;
      }
      // Terminal: taken/duplicate/missed/cancelled/upcoming or 42501.
      await clearQueuedDose(entry.doseEventId);
    }
  }

  return 0;
}

/** How many confirmations are waiting to reach the server. */
export async function countQueuedConfirmations(): Promise<number> {
  const entries = await listDoseOutbox();
  return entries.length;
}
