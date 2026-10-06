import { z } from 'zod';

/**
 * Sprint 9 reports (docs/specs/sprint-9.md).
 *
 * The report is a read-only aggregate computed server-side by
 * `public.get_adherence_report` and bucketed by each occurrence's stored
 * `scheduled_local_date`, so the same payload serves the caregiver, the elder and
 * the connected family member. It carries **counts and dates only** — no dose id,
 * medication, or timestamp — which is what makes it safe to hand a family member
 * the summary without leaking the medical detail.
 */

/** OD1: the offered ranges are fixed. No custom date picker. */
export const reportRangeSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type ReportRange = z.infer<typeof reportRangeSchema>;

export const reportRangeOptions: readonly ReportRange[] = [7, 30, 90];

export const defaultReportRangeDays: ReportRange = 7;

/**
 * The RPC accepts at most 366 inclusive dates. Kept in one place so the shared
 * schema and the database boundary cannot drift.
 */
export const maxReportRangeDays = 366;

const dayCountSchema = z.number().int().nonnegative();
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a local calendar date (YYYY-MM-DD)');

/** One day of the series. Days with no occurrences are present with zeros. */
export const adherenceDaySchema = z.object({
  date: localDateSchema,
  taken: dayCountSchema,
  missed: dayCountSchema,
  open: dayCountSchema,
  settled: dayCountSchema,
  expected: dayCountSchema,
});
export type AdherenceDay = z.infer<typeof adherenceDaySchema>;

/**
 * `settled = taken + missed` (the confirmation-rate denominator);
 * `expected = settled + open`; `percent = round(100 * taken / settled)`, 0 when
 * nothing is settled. `open` is an occurrence with neither fact — upcoming or
 * due — and is never counted as missed.
 */
export const adherenceTotalsSchema = z.object({
  taken: dayCountSchema,
  missed: dayCountSchema,
  open: dayCountSchema,
  settled: dayCountSchema,
  expected: dayCountSchema,
  percent: z.number().int().min(0).max(100),
});
export type AdherenceTotals = z.infer<typeof adherenceTotalsSchema>;

export const adherenceReportSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  days: z.array(adherenceDaySchema),
  totals: adherenceTotalsSchema,
});
export type AdherenceReport = z.infer<typeof adherenceReportSchema>;

function toLocalIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The inclusive, device-local date bounds for a range of `days` ending today.
 *
 * Date-only strings are built from the local calendar fields directly — never by
 * parsing a stored local date and re-serialising it — so a device timezone can
 * never shift the day the elder sees. Pure and injectable (`now`) for testing.
 */
export function reportRangeBounds(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  return { from: toLocalIsoDay(from), to: toLocalIsoDay(to) };
}
