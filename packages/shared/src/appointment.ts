import { z } from 'zod';

export const appointmentTypeSchema = z.enum(['visit', 'in_home']);
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  visit: 'Clinic visit',
  in_home: 'In-home visit',
};

/** Past `upcoming` items display as `overdue` until resolved. */
export const appointmentStateSchema = z.enum(['upcoming', 'completed', 'cancelled', 'overdue']);
export type AppointmentState = z.infer<typeof appointmentStateSchema>;

export const appointmentStateLabels: Record<AppointmentState, string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
  overdue: 'Overdue',
};

/**
 * Sprint 7 appointment contracts (docs/specs/sprint-7.md).
 *
 * These mirror the checks in
 * `supabase/migrations/20261029120000_sprint7_appointments.sql`, so the client
 * rejects the same input the RPC would and the two cannot drift silently.
 *
 * The write shape takes a **local date + time + IANA timezone**, never a UTC
 * instant: the RPC converts it with the same `local_dose_timestamp` helper the
 * schedule generator uses, so the client never does timezone arithmetic (a class
 * of bug that is easy to get wrong in Hermes).
 *
 * As in Sprint 3, no user-facing validation sentences live here — the screens map
 * an issue's `path`/`code` to owner-approved copy.
 */

// Field bounds, matching the column checks one-for-one.
export const appointmentTitleMaxLength = 120;
export const appointmentProviderMaxLength = 120;
export const appointmentFacilityMaxLength = 160;
export const appointmentLocationMaxLength = 200;
export const appointmentAddressMaxLength = 300;
export const appointmentContactPhoneMaxLength = 40;
export const appointmentNotesMaxLength = 1000;
export const appointmentNoteMaxLength = 500;

/**
 * The reminder lead times in minutes. The column check is exactly this set; a null
 * lead means the reminder is Off. Owner decision 2026-10-06: 1 hour, 3 hours,
 * 24 hours, 2 days, defaulting to 24 hours.
 */
export const appointmentReminderLeadMinutes = [60, 180, 1440, 2880] as const;
export type AppointmentReminderLeadMinutes = (typeof appointmentReminderLeadMinutes)[number];

export const defaultAppointmentReminderLeadMinutes: AppointmentReminderLeadMinutes = 1440;

export interface AppointmentReminderOption {
  readonly minutes: AppointmentReminderLeadMinutes | null;
  readonly label: string;
}

/**
 * The picker options, including Off. The labels are proposed in the Sprint 7 copy
 * batch for owner approval (docs/specs/sprint-7.md).
 */
export const appointmentReminderOptions: readonly AppointmentReminderOption[] = [
  { minutes: null, label: 'No reminder' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: '24 hours before' },
  { minutes: 2880, label: '2 days before' },
];

/** The label for a stored lead value, tolerant of an unknown/absent value. */
export function appointmentReminderLabel(minutes: number | null | undefined): string {
  const match = appointmentReminderOptions.find((option) => option.minutes === (minutes ?? null));
  return match?.label ?? 'No reminder';
}

/** A local calendar day, `YYYY-MM-DD`. */
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A local clock time, `HH:MM` or `HH:MM:SS`. */
export const localTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim().length === 0 ? null : value.trim()))
    .nullable();

/**
 * The C-07 write shape. The conditional-field rule is enforced in the `superRefine`:
 * a `visit` needs a facility and a location; an `in_home` visit needs an address,
 * a visitor/provider and a contact number. A blank optional field normalizes to
 * `null`, exactly as the RPC stores it.
 */
export const appointmentWriteSchema = z
  .object({
    appointmentType: appointmentTypeSchema,
    title: requiredText(appointmentTitleMaxLength),
    startDate: localDateSchema,
    startTime: localTimeSchema,
    timezone: requiredText(64),
    provider: optionalText(appointmentProviderMaxLength),
    facility: optionalText(appointmentFacilityMaxLength),
    location: optionalText(appointmentLocationMaxLength),
    address: optionalText(appointmentAddressMaxLength),
    contactPhone: optionalText(appointmentContactPhoneMaxLength),
    notes: optionalText(appointmentNotesMaxLength),
    reminderLeadMinutes: z
      .union([z.literal(60), z.literal(180), z.literal(1440), z.literal(2880)])
      .nullable(),
    notifyElder: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.appointmentType === 'visit') {
      if (!value.facility) {
        ctx.addIssue({
          code: 'custom',
          path: ['facility'],
          message: 'required for a clinic visit',
        });
      }
      if (!value.location) {
        ctx.addIssue({
          code: 'custom',
          path: ['location'],
          message: 'required for a clinic visit',
        });
      }
    } else {
      if (!value.address) {
        ctx.addIssue({
          code: 'custom',
          path: ['address'],
          message: 'required for an in-home visit',
        });
      }
      if (!value.provider) {
        ctx.addIssue({
          code: 'custom',
          path: ['provider'],
          message: 'required for an in-home visit',
        });
      }
      if (!value.contactPhone) {
        ctx.addIssue({
          code: 'custom',
          path: ['contactPhone'],
          message: 'required for an in-home visit',
        });
      }
    }
  });

export type AppointmentWrite = z.infer<typeof appointmentWriteSchema>;

/** The stored lifecycle state — `overdue` is derived, never stored. */
export type StoredAppointmentState = Exclude<AppointmentState, 'overdue'>;

/**
 * The display state. A past, unresolved `upcoming` appointment reads as `overdue`
 * until the caregiver resolves it (product-flow section 4 F). The list keeps such
 * an item in the Upcoming tab with an Overdue badge (owner decision 2026-10-06).
 */
export function appointmentDisplayState(
  state: StoredAppointmentState,
  startAt: string | Date,
  now: Date = new Date(),
): AppointmentState {
  if (state === 'upcoming' && new Date(startAt).getTime() < now.getTime()) {
    return 'overdue';
  }
  return state;
}

/** Whether an appointment still counts as unresolved (shown in the Upcoming tab). */
export function isAppointmentOpen(state: StoredAppointmentState): boolean {
  return state === 'upcoming';
}
