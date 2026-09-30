import { z } from 'zod';

import type { DoseStatus } from './dose';

/**
 * In-app notification events (docs/specs/sprint-4.md). The database restricts
 * `notifications.event_type` to exactly this set, so the client cannot receive a
 * value it has no presentation for.
 */
export const notificationEventTypeSchema = z.enum(['dose_confirmed', 'dose_missed']);
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

/**
 * The dose status each event reports. The notification centre reuses
 * `doseStatusPresentation` (label + icon + tone) rather than keeping a second
 * vocabulary, so a notification is never conveyed by colour alone
 * (docs/02-ui-ux-standard.md section 6).
 */
export const notificationEventDoseStatus: Record<NotificationEventType, DoseStatus> = {
  dose_confirmed: 'taken',
  dose_missed: 'missed',
};
