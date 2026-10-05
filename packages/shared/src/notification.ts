import { z } from 'zod';

import {
  appointmentStatePresentation,
  doseStatusPresentation,
  stockStatusPresentation,
  type StatusPresentation,
} from './status-presentation';

/**
 * In-app notification events (docs/specs/sprint-4.md, extended by Sprints 5 and 7).
 *
 * The database restricts `notifications.event_type` to exactly this set
 * (`20261029120000_sprint7_appointments.sql`, F). The client must therefore know
 * every value; `status.test.ts` fails if one is added here without a presentation.
 *
 * Sprint 5 added `stock_low`/`stock_out`/`stock_expiring`/`medicine_needs_review`
 * on the server but left this enum unchanged, so a stock alert rendered as
 * `dose_confirmed` ("Taken") in the notification centre. Sprint 7 closes that gap.
 */
export const notificationEventTypeSchema = z.enum([
  'dose_confirmed',
  'dose_missed',
  'stock_low',
  'stock_out',
  'stock_expiring',
  'medicine_needs_review',
  'appointment_upcoming',
  'help_request_created',
  'help_request_accepted',
  'help_request_completed',
  'help_request_cancelled',
]);
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

/**
 * Where a notification points. The value travels with the row so the notification
 * centre can navigate to the right record for the viewer's role, rather than
 * assuming every notification is about a dose.
 */
export const notificationTargetTableSchema = z.enum([
  'dose_events',
  'medications',
  'appointments',
  'help_requests',
]);
export type NotificationTargetTable = z.infer<typeof notificationTargetTableSchema>;

/**
 * The presentation each event reports, reusing the existing status presentations so
 * a notification carries a label + icon + tone and is never conveyed by colour
 * alone (docs/02-ui-ux-standard.md section 6).
 */
export const notificationPresentation: Record<NotificationEventType, StatusPresentation> = {
  dose_confirmed: doseStatusPresentation.taken,
  dose_missed: doseStatusPresentation.missed,
  stock_low: stockStatusPresentation.low,
  stock_out: stockStatusPresentation.out,
  stock_expiring: stockStatusPresentation.expiring,
  medicine_needs_review: stockStatusPresentation.needs_review,
  appointment_upcoming: appointmentStatePresentation.upcoming,
  help_request_created: { label: 'Help requested', icon: 'help', tone: 'attention' },
  help_request_accepted: { label: 'Help accepted', icon: 'check', tone: 'success' },
  help_request_completed: { label: 'Help completed', icon: 'check', tone: 'success' },
  help_request_cancelled: { label: 'Help cancelled', icon: 'close', tone: 'neutral' },
};
