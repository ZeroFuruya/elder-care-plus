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
