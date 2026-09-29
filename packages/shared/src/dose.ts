import { z } from 'zod';

/**
 * `upcoming -> due -> taken` or `upcoming -> due -> missed`.
 * `taken` and `missed` are terminal except for an explicitly audited correction.
 */
export const doseStatusSchema = z.enum(['upcoming', 'due', 'taken', 'missed']);
export type DoseStatus = z.infer<typeof doseStatusSchema>;

export const doseStatusLabels: Record<DoseStatus, string> = {
  upcoming: 'Upcoming',
  due: 'Due now',
  taken: 'Taken',
  missed: 'Missed',
};

/** Offline confirmations are visibly queued until the server accepts them exactly once. */
export const syncStateSchema = z.enum(['synced', 'pending']);
export type SyncState = z.infer<typeof syncStateSchema>;

export const syncStateLabels: Record<SyncState, string> = {
  synced: 'Synced',
  pending: 'Pending sync',
};

/** Approved default in the system documentation (BR-03). */
export const DEFAULT_GRACE_MINUTES = 30;

export interface DoseTiming {
  scheduledAt: Date | number | string;
  takenAt?: Date | number | string | null;
  /**
   * The server's persisted miss timestamp. When set the dose is `missed` even if the client clock
   * would still call it `due`, so a late or skewed device cannot re-open a settled miss.
   */
  missedAt?: Date | number | string | null;
}

function toTime(value: Date | number | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Derives the status a dose should display *right now*.
 *
 * `taken_at` and `missed_at` are the stored facts; everything else is computed from the schedule and
 * the grace period, so a stale row can never show the wrong state.
 *
 *   taken  -> there is a confirmation timestamp
 *   missed -> the server settled a miss, or the grace period has elapsed with no confirmation
 *   due    -> the scheduled time has passed but the grace period has not
 *   upcoming -> the scheduled time is still in the future
 *
 * A row with both timestamps is impossible (`dose_events` forbids it); if one is ever seen, `taken`
 * wins so the confirmed dose is never shown as missed.
 */
export function deriveDoseStatus(
  timing: DoseTiming,
  now: Date | number | string = new Date(),
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): DoseStatus {
  if (timing.takenAt) return 'taken';
  if (timing.missedAt) return 'missed';

  const scheduled = toTime(timing.scheduledAt);
  const current = toTime(now);

  if (current >= scheduled + graceMinutes * 60_000) return 'missed';
  if (current >= scheduled) return 'due';
  return 'upcoming';
}
