import {
  adherenceReportSchema,
  reportRangeBounds,
  type AdherenceReport,
  type ReportRange,
} from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

/**
 * Report access for the Supabase-backed app (docs/specs/sprint-9.md).
 *
 * One read-only RPC serves the caregiver, the elder and the connected family
 * member. Its payload is counts and dates only, so the same call can back a
 * family summary without leaking the underlying dose rows. `now` is injectable so
 * the range arithmetic is testable without a clock.
 */

export type { AdherenceReport, ReportRange };

export async function getAdherenceReport(
  elderId: string,
  range: ReportRange,
  now: Date = new Date(),
): Promise<AdherenceReport> {
  const { from, to } = reportRangeBounds(range, now);

  const { data, error } = await getSupabase().rpc('get_adherence_report', {
    p_elder_id: elderId,
    p_from: from,
    p_to: to,
  });

  if (error) throw new Error('Could not load the report.');

  const parsed = adherenceReportSchema.safeParse(data);
  if (!parsed.success) throw new Error('The report could not be read.');
  return parsed.data;
}
