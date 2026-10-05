import type { BatchInput, MedicationForm, MedicationInput, ScheduleInput } from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

/**
 * Medication-plan access for the Supabase-backed app (docs/specs/sprint-3.md).
 *
 * Reads are plain RLS-scoped selects: the server decides whether this account may
 * see the elder's plan. Writes are guarded RPCs only — the client never inserts
 * or updates these tables directly, because `authenticated` has no write grant.
 *
 * Schedules and batches carry no elder column, so they are fetched by the
 * medicine ids already read for that elder. That keeps every query on the
 * `.eq`/`.in` filters this codebase already proves out, rather than relying on
 * PostgREST embedded-resource filtering.
 */

const MEDICATION_COLUMNS =
  'id, elder_id, name, strength, form, dose_quantity, dose_unit, instructions, start_date, end_date, is_active, deactivated_at' as const;

const SCHEDULE_COLUMNS =
  'id, medication_id, days_of_week, time_of_day, timezone, grace_minutes, is_active' as const;

const BATCH_COLUMNS =
  'id, medication_id, quantity, unit, lot_number, expiry_date, low_stock_threshold, refill_contact, is_active' as const;

interface MedicationRow {
  id: string;
  elder_id: string;
  name: string;
  strength: string;
  form: MedicationForm | null;
  dose_quantity: number | string;
  dose_unit: string;
  instructions: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  deactivated_at: string | null;
}

interface ScheduleRow {
  id: string;
  medication_id: string;
  days_of_week: number[];
  time_of_day: string;
  timezone: string;
  grace_minutes: number;
  is_active: boolean;
}

interface BatchRow {
  id: string;
  medication_id: string;
  quantity: number | string;
  unit: string;
  lot_number: string | null;
  expiry_date: string;
  low_stock_threshold: number | string | null;
  refill_contact: string | null;
  is_active: boolean;
}

export interface Medication {
  id: string;
  elderId: string;
  name: string;
  strength: string;
  form: MedicationForm | null;
  doseQuantity: number;
  doseUnit: string;
  instructions: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
}

export interface MedicationSchedule {
  id: string;
  medicationId: string;
  daysOfWeek: number[];
  /** `HH:MM`. The column stores `HH:MM:SS`, trimmed on read for the form. */
  timeOfDay: string;
  timezone: string;
  graceMinutes: number;
  isActive: boolean;
}

export interface MedicineBatch {
  id: string;
  medicationId: string;
  quantity: number;
  unit: string;
  lotNumber: string | null;
  expiryDate: string;
  lowStockThreshold: number | null;
  refillContact: string | null;
  isActive: boolean;
}

export interface MedicationPlan {
  medications: Medication[];
  schedules: MedicationSchedule[];
  batches: MedicineBatch[];
}

export interface MedicationDetail {
  medication: Medication;
  schedules: MedicationSchedule[];
  batches: MedicineBatch[];
}

function toMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    elderId: row.elder_id,
    name: row.name,
    strength: row.strength,
    form: row.form,
    doseQuantity: Number(row.dose_quantity),
    doseUnit: row.dose_unit,
    instructions: row.instructions,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    deactivatedAt: row.deactivated_at,
  };
}

function toSchedule(row: ScheduleRow): MedicationSchedule {
  return {
    id: row.id,
    medicationId: row.medication_id,
    daysOfWeek: row.days_of_week,
    timeOfDay: row.time_of_day.slice(0, 5),
    timezone: row.timezone,
    graceMinutes: row.grace_minutes,
    isActive: row.is_active,
  };
}

function toBatch(row: BatchRow): MedicineBatch {
  return {
    id: row.id,
    medicationId: row.medication_id,
    quantity: Number(row.quantity),
    unit: row.unit,
    lotNumber: row.lot_number,
    expiryDate: row.expiry_date,
    lowStockThreshold: row.low_stock_threshold === null ? null : Number(row.low_stock_threshold),
    refillContact: row.refill_contact,
    isActive: row.is_active,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every medicine for the elder, active first, then by name. */
export async function listMedications(elderId: string): Promise<Medication[]> {
  const { data, error } = await getSupabase()
    .from('medications')
    .select(MEDICATION_COLUMNS)
    .eq('elder_id', elderId)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })
    .returns<MedicationRow[]>();

  if (error) throw new Error('Could not load the medicines.');
  return data.map(toMedication);
}

/** Schedules for a set of medicines. An empty id list is answered locally. */
export async function listSchedulesFor(medicationIds: string[]): Promise<MedicationSchedule[]> {
  if (medicationIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('medication_schedules')
    .select(SCHEDULE_COLUMNS)
    .in('medication_id', medicationIds)
    .order('time_of_day', { ascending: true })
    .returns<ScheduleRow[]>();

  if (error) throw new Error('Could not load the schedules.');
  return data.map(toSchedule);
}

/** Stock batches for a set of medicines, active first. */
export async function listBatchesFor(medicationIds: string[]): Promise<MedicineBatch[]> {
  if (medicationIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('medicine_batches')
    .select(BATCH_COLUMNS)
    .in('medication_id', medicationIds)
    .order('is_active', { ascending: false })
    .order('expiry_date', { ascending: true })
    .returns<BatchRow[]>();

  if (error) throw new Error('Could not load the stock batches.');
  return data.map(toBatch);
}

/** The whole plan for one elder, in three scoped reads. */
export async function getMedicationPlan(elderId: string): Promise<MedicationPlan> {
  const medications = await listMedications(elderId);
  const ids = medications.map((medication) => medication.id);

  const [schedules, batches] = await Promise.all([listSchedulesFor(ids), listBatchesFor(ids)]);
  return { medications, schedules, batches };
}

/** One medicine with its own schedules and batches, or `null` when RLS hides it. */
export async function getMedicationDetail(medicationId: string): Promise<MedicationDetail | null> {
  const { data, error } = await getSupabase()
    .from('medications')
    .select(MEDICATION_COLUMNS)
    .eq('id', medicationId)
    .maybeSingle<MedicationRow>();

  if (error) throw new Error('Could not load the medicine.');
  if (!data) return null;

  const [schedules, batches] = await Promise.all([
    listSchedulesFor([medicationId]),
    listBatchesFor([medicationId]),
  ]);
  return { medication: toMedication(data), schedules, batches };
}

// ---------------------------------------------------------------------------
// Writes (guarded RPCs only)
// ---------------------------------------------------------------------------

interface PostgrestError {
  code?: string;
  message: string;
}

/**
 * Turns a PostgREST error into something safe to show. The server's raised
 * strings are developer-facing, so they are never rendered.
 *
 * Two already-approved Sprint 2 sentences are reused rather than inventing new
 * ones: the authorization failure and the generic "not valid" case. The specific
 * duplicate warning is a client-side check against the loaded plan (acceptance
 * criterion 12), so the server's unique violation only has to be a safe fallback.
 */
export function medicationWriteError(error: PostgrestError, fallback: string): Error {
  if (error.code === '42501') return new Error('Only the linked caregiver can change this.');
  if (error.code === '23505' || error.code === '23514') {
    return new Error('Some details are not valid. Check the form and try again.');
  }
  if (error.code === 'P0002') {
    return new Error('That medicine no longer exists. Refresh and try again.');
  }
  return new Error(fallback);
}

function medicationParams(input: MedicationInput) {
  return {
    p_name: input.name,
    p_strength: input.strength,
    p_form: input.form,
    p_dose_quantity: input.doseQuantity,
    p_dose_unit: input.doseUnit,
    p_instructions: input.instructions,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
  };
}

export async function createMedication(elderId: string, input: MedicationInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_medication', {
    p_elder_id: elderId,
    ...medicationParams(input),
  });

  if (error) throw medicationWriteError(error, 'Could not save the medicine.');
  return data as string;
}

export async function updateMedication(id: string, input: MedicationInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_medication', {
    p_id: id,
    ...medicationParams(input),
  });

  if (error) throw medicationWriteError(error, 'Could not save the medicine.');
}

export async function setMedicationActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_medication_active', {
    p_id: id,
    p_active: active,
  });

  if (error) throw medicationWriteError(error, 'Could not change the medicine.');
}

export async function createSchedule(medicationId: string, input: ScheduleInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_schedule', {
    p_medication_id: medicationId,
    p_days_of_week: input.daysOfWeek,
    p_time_of_day: input.timeOfDay,
    p_timezone: input.timezone,
    p_grace_minutes: input.graceMinutes,
  });

  if (error) throw medicationWriteError(error, 'Could not save the schedule.');
  return data as string;
}

export async function updateSchedule(id: string, input: ScheduleInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_schedule', {
    p_id: id,
    p_days_of_week: input.daysOfWeek,
    p_time_of_day: input.timeOfDay,
    p_timezone: input.timezone,
    p_grace_minutes: input.graceMinutes,
  });

  if (error) throw medicationWriteError(error, 'Could not save the schedule.');
}

export async function setScheduleActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_schedule_active', {
    p_id: id,
    p_active: active,
  });

  if (error) throw medicationWriteError(error, 'Could not change the schedule.');
}

export async function createBatch(
  medicationId: string,
  input: BatchInput,
  makeActive: boolean,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_batch', {
    p_medication_id: medicationId,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_lot_number: input.lotNumber,
    p_expiry_date: input.expiryDate,
    p_low_stock_threshold: input.lowStockThreshold,
    p_refill_contact: input.refillContact,
    p_make_active: makeActive,
  });

  if (error) throw medicationWriteError(error, 'Could not save the stock batch.');
  return data as string;
}

export async function updateBatch(id: string, input: BatchInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_batch', {
    p_id: id,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_lot_number: input.lotNumber,
    p_expiry_date: input.expiryDate,
    p_low_stock_threshold: input.lowStockThreshold,
    p_refill_contact: input.refillContact,
  });

  if (error) throw medicationWriteError(error, 'Could not save the stock batch.');
}

export async function setActiveBatch(batchId: string): Promise<void> {
  const { error } = await getSupabase().rpc('set_active_batch', { p_batch_id: batchId });

  if (error) throw medicationWriteError(error, 'Could not change the stock batch.');
}

export async function deactivateBatch(batchId: string, reason?: string): Promise<void> {
  const { error } = await getSupabase().rpc('deactivate_batch', {
    p_id: batchId,
    p_reason: reason ?? null,
  });

  if (error) throw medicationWriteError(error, 'Could not change the stock batch.');
}

/** The owner-approved manual stock adjustment reasons (docs/specs/sprint-5.md). */
export type StockAdjustmentReason =
  'restock' | 'correction' | 'damage' | 'waste' | 'count_adjustment';

export async function adjustStock(
  batchId: string,
  delta: number,
  reason: StockAdjustmentReason,
  note?: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('adjust_stock', {
    p_batch_id: batchId,
    p_delta: delta,
    p_reason: reason,
    p_note: note ?? null,
  });

  if (error) throw medicationWriteError(error, 'Could not adjust the stock.');
}

// ---------------------------------------------------------------------------
// Derived helpers for the screens
// ---------------------------------------------------------------------------

/** The active batch of a medicine, if it has one. */
export function activeBatchOf(
  batches: MedicineBatch[],
  medicationId: string,
): MedicineBatch | null {
  return batches.find((batch) => batch.medicationId === medicationId && batch.isActive) ?? null;
}

/** A medicine's schedules, active last so the plan reads in time order. */
export function schedulesOf(
  schedules: MedicationSchedule[],
  medicationId: string,
): MedicationSchedule[] {
  return schedules
    .filter((schedule) => schedule.medicationId === medicationId)
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay));
}

/**
 * The client-side duplicate check behind the non-blocking warning (acceptance
 * criterion 12). Phrased as "already on this elder's plan" and never as an
 * interaction judgement (docs/specs/sprint-3.md, open question 6).
 *
 * Case- and whitespace-insensitive: "Amlodipine" already on the plan is a
 * duplicate of " amlodipine ". Compares against active medicines only, because a
 * deactivated medicine is not on the plan.
 */
export function isDuplicateMedicineName(
  medications: Medication[],
  name: string,
  ignoreId?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  if (wanted.length === 0) return false;
  return medications.some(
    (medication) =>
      medication.isActive &&
      medication.id !== ignoreId &&
      medication.name.trim().toLowerCase() === wanted,
  );
}

/** The same slot comparison the partial unique index makes: time plus weekday set. */
export function isDuplicateSchedule(
  schedules: MedicationSchedule[],
  medicationId: string,
  daysOfWeek: number[],
  timeOfDay: string,
  ignoreId?: string,
): boolean {
  const wantedDays = [...new Set(daysOfWeek)].sort((a, b) => a - b).join(',');
  const wantedTime = timeOfDay.slice(0, 5);
  return schedules.some(
    (schedule) =>
      schedule.medicationId === medicationId &&
      schedule.isActive &&
      schedule.id !== ignoreId &&
      [...schedule.daysOfWeek].sort((a, b) => a - b).join(',') === wantedDays &&
      schedule.timeOfDay === wantedTime,
  );
}
