import { z } from 'zod';

import type { StockStatus } from './inventory';

/**
 * Sprint 3 medication contracts (docs/specs/sprint-3.md).
 *
 * These schemas mirror the checks in
 * `supabase/migrations/20261008120000_sprint3_medications.sql`, so the client
 * rejects the same input the RPC would and the two cannot drift silently. They
 * are the **write** shapes — what the C-03 form validates before calling a
 * guarded RPC.
 *
 * No user-facing message strings live here. Sprint 3's validation copy has no
 * approved source yet (`docs/02-ui-ux-standard.md` section 10), so the screens
 * map a zod issue's `path` and `code` to owner-approved wording rather than
 * `packages/shared` inventing sentences. Sprint 2's `emergency.ts` could carry
 * messages only because that copy had already been approved.
 */

// ---------------------------------------------------------------------------
// Forms and dose units
// ---------------------------------------------------------------------------

/** `medications.form`, straight from the column's check constraint. */
export const medicationFormSchema = z.enum(['tablet', 'capsule', 'liquid', 'other']);
export type MedicationForm = z.infer<typeof medicationFormSchema>;

/**
 * Display labels. Only `tablet` and `mg` appear in the approved wireframes
 * (`C-03` `500 mg tablet`, `C-04` `1 tablet - 30 min grace`), so these labels were escalated to
 * the owner, who approved them in bulk on 2026-09-30 (`apps/mobile/src/fixtures/copy-sources.ts`).
 */
export const medicationFormLabels: Record<MedicationForm, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  liquid: 'Liquid',
  other: 'Other',
};

/**
 * The supported dose units.
 *
 * `docs/specs/sprint-3.md` open question 4 proposes exactly this list plus an
 * explicit `other`. The database column is plain `text`, so this list constrains
 * the **picker**, never storage: whatever the caregiver confirms is what is
 * written to `dose_unit`.
 */
export const doseUnitSchema = z.enum([
  'tablet',
  'capsule',
  'ml',
  'mg',
  'drop',
  'puff',
  'sachet',
  'unit',
  'other',
]);
export type DoseUnit = z.infer<typeof doseUnitSchema>;

/** The picker value meaning "the caregiver typed their own unit". */
export const CUSTOM_DOSE_UNIT = 'other';

/**
 * Display labels for the unit picker. `tablet` and `mg` are wireframe vocabulary
 * (`C-03`/`C-02`/`C-04`); the rest are escalated, because the wireframes show no
 * unit list.
 */
export const doseUnitLabels: Record<DoseUnit, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  ml: 'ml',
  mg: 'mg',
  drop: 'Drop',
  puff: 'Puff',
  sachet: 'Sachet',
  unit: 'Unit',
  other: 'Other',
};

/**
 * Short weekday names, Sunday-first to match the `days_of_week` range. `C-04`
 * draws `Mon Tue Wed Thu Fri`, so Saturday and Sunday are escalated.
 */
export const weekdayShortLabels: readonly string[] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

/**
 * The value stored in `dose_unit`. A listed unit is stored as itself; `other`
 * is stored as the caregiver's own words, trimmed. Returns `null` when `other`
 * was chosen with nothing typed, which the form must reject rather than write an
 * empty unit.
 */
export function resolveDoseUnit(unit: DoseUnit, customUnit?: string | null): string | null {
  if (unit !== CUSTOM_DOSE_UNIT) return unit;
  const trimmed = (customUnit ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

/** Matches the `numeric(10, 3)` stock columns; a larger value cannot be stored. */
export const MAX_STOCK_AMOUNT = 9_999_999.999;

/** Bounded free text the medication tables store, matched by their column checks. */
export const MAX_MEDICATION_LABEL_LENGTH = 200;
export const MAX_MEDICATION_TEXT_LENGTH = 2000;
export const MAX_DOSE_UNIT_LENGTH = 100;

/**
 * A non-blank string. The database rejects whitespace-only `name`, `strength`,
 * `dose_unit`, `instructions` and `timezone`, so trimming here keeps client and
 * server in step.
 */
const nonBlankText = z.string().trim().min(1);

/**
 * A non-blank string with a ceiling. The `max` mirrors the length check added to
 * each column by the validation-hardening migration.
 */
function boundedText(max: number) {
  return nonBlankText.max(max);
}

/** `YYYY-MM-DD` — the same literal form the `date` column and the date field use. */
export const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDay = z.infer<typeof isoDaySchema>;

/** `HH:MM`, 24-hour — the form the `time` column stores. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

export const MIN_GRACE_MINUTES = 5;
export const MAX_GRACE_MINUTES = 120;
export const GRACE_STEP_MINUTES = 5;

/**
 * 5-120 minutes. The column enforces the range; the 5-minute step is a form
 * rule (docs/specs/sprint-3.md, `C-03`), so it is enforced here too.
 */
export const graceMinutesSchema = z
  .number()
  .int()
  .min(MIN_GRACE_MINUTES)
  .max(MAX_GRACE_MINUTES)
  .refine((value) => value % GRACE_STEP_MINUTES === 0);

/** 0 = Sunday … 6 = Saturday, matching the column's check constraint. */
export const weekdaySchema = z.number().int().min(0).max(6);

/** At least one weekday; the column rejects an empty array. */
export const daysOfWeekSchema = z.array(weekdaySchema).min(1);

/**
 * Sorted, de-duplicated weekdays — the canonical form `create_schedule` stores,
 * so `[1,2]` and `[2,1]` cannot become two different slots. Pure and total:
 * validation is the schema's job, canonicalisation is this function's.
 */
export function canonicalizeDaysOfWeek(days: readonly number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Write shapes, one per guarded RPC family
// ---------------------------------------------------------------------------

/**
 * The fields `create_medication` / `update_medication` accept.
 *
 * `doseUnit` is the **resolved** unit ({@link resolveDoseUnit}), not the picker
 * value: the RPC takes the text that will be stored. `endDate` compares
 * lexicographically, which is exact for `YYYY-MM-DD`.
 */
export const medicationInputSchema = z
  .object({
    name: boundedText(MAX_MEDICATION_LABEL_LENGTH),
    strength: boundedText(MAX_MEDICATION_LABEL_LENGTH),
    form: medicationFormSchema.nullable(),
    doseQuantity: z.number().positive().max(MAX_STOCK_AMOUNT),
    doseUnit: boundedText(MAX_DOSE_UNIT_LENGTH),
    instructions: boundedText(MAX_MEDICATION_TEXT_LENGTH),
    startDate: isoDaySchema,
    endDate: isoDaySchema.nullable(),
  })
  .refine((value) => value.endDate === null || value.endDate >= value.startDate);
export type MedicationInput = z.infer<typeof medicationInputSchema>;

/** The fields `create_schedule` / `update_schedule` accept, already canonical. */
export const scheduleInputSchema = z.object({
  daysOfWeek: daysOfWeekSchema,
  timeOfDay: timeOfDaySchema,
  timezone: nonBlankText,
  graceMinutes: graceMinutesSchema,
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/**
 * The fields a batch RPC accepts. Absent optional values are `null`, never the
 * empty string — the columns store NULL for "not recorded", so the form must
 * convert a cleared field before validating.
 */
export const batchInputSchema = z.object({
  quantity: z.number().min(0).max(MAX_STOCK_AMOUNT),
  unit: boundedText(MAX_DOSE_UNIT_LENGTH),
  lotNumber: boundedText(MAX_DOSE_UNIT_LENGTH).nullable(),
  expiryDate: isoDaySchema,
  lowStockThreshold: z.number().min(0).max(MAX_STOCK_AMOUNT).nullable(),
  refillContact: boundedText(MAX_MEDICATION_LABEL_LENGTH).nullable(),
});
export type BatchInput = z.infer<typeof batchInputSchema>;

// ---------------------------------------------------------------------------
// Stock state
// ---------------------------------------------------------------------------

export interface BatchLike {
  readonly isActive: boolean;
  readonly unit: string;
  readonly expiryDate: string;
}

function toDayString(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** True when `value`'s calendar day falls before `reference`'s. */
function isEarlierDay(value: string | Date, reference: string | Date): boolean {
  return toDayString(value) < toDayString(reference);
}

/**
 * The predicate the Sprint 3 screens and Sprint 4's automatic decrement share:
 * the batch is active, has not expired, and its unit is **exactly** the
 * medicine's dose unit.
 *
 * Exact, case-sensitive equality mirrors the database (`unit = dose_unit`), so
 * the client warning matches what Sprint 4 will actually do. Anything else is an
 * incomplete plan: never a silent decrement, always a caregiver-review reason.
 */
export function hasUsableActiveBatch(
  batch: BatchLike | null | undefined,
  doseUnit: string,
  today: string | Date = new Date(),
): boolean {
  if (!batch) return false;
  if (!batch.isActive) return false;
  if (isEarlierDay(batch.expiryDate, today)) return false;
  return batch.unit === doseUnit;
}

/**
 * The stock state a batch implies, using the existing `StockStatus`.
 *
 * `expiring` is deliberately **not** returned: it needs the warning window
 * (30/14/7/1 days) that Sprint 5 defines. `expired` and `needs_review` are facts
 * this sprint already knows — an expired batch can never be active
 * (docs/specs/sprint-3.md), and `inventory.ts` defines `needs_review` as "no
 * valid active batch remains".
 *
 * `today` is injectable so the derivation is testable without a clock.
 */
export function stockStatusFromBatch(
  quantity: number,
  threshold: number | null | undefined,
  expiryDate: string | Date | null | undefined,
  hasValidActiveBatch: boolean,
  today: string | Date = new Date(),
): StockStatus {
  if (expiryDate != null && isEarlierDay(expiryDate, today)) return 'expired';
  if (!hasValidActiveBatch) return 'needs_review';
  if (quantity <= 0) return 'out';
  if (threshold != null && quantity <= threshold) return 'low';
  return 'normal';
}
