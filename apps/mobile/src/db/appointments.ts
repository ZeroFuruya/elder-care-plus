import type { AppointmentType, AppointmentWrite, StoredAppointmentState } from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

/**
 * Appointment access for the Supabase-backed app (docs/specs/sprint-7.md).
 *
 * Reads are plain RLS-scoped selects: a linked caregiver manager, the elder themselves, and an
 * active family member all see the same rows. Writes are the four guarded RPCs only — the client
 * has no insert/update grant on `appointments`, so a direct write is refused by the database.
 *
 * The write shape is a local date + time + IANA zone, never a UTC instant: the RPC converts it with
 * the same `local_dose_timestamp` helper the schedule generator uses, so the client never does
 * timezone arithmetic. `overdue` is derived on read (see `appointmentDisplayState`).
 */

const APPOINTMENT_COLUMNS =
  'id, elder_id, appointment_type, state, title, start_at, timezone, provider, facility, location, address, contact_phone, notes, reminder_lead_minutes, notify_elder, created_by, created_at, updated_at, completed_at, cancelled_at, completion_note, cancel_note' as const;

interface AppointmentRow {
  id: string;
  elder_id: string;
  appointment_type: AppointmentType;
  state: StoredAppointmentState;
  title: string;
  start_at: string;
  timezone: string;
  provider: string | null;
  facility: string | null;
  location: string | null;
  address: string | null;
  contact_phone: string | null;
  notes: string | null;
  reminder_lead_minutes: number | null;
  notify_elder: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  completion_note: string | null;
  cancel_note: string | null;
}

export interface Appointment {
  id: string;
  elderId: string;
  appointmentType: AppointmentType;
  state: StoredAppointmentState;
  title: string;
  /** The UTC instant, rendered in `timezone` for display. */
  startAt: string;
  timezone: string;
  provider: string | null;
  facility: string | null;
  location: string | null;
  address: string | null;
  contactPhone: string | null;
  notes: string | null;
  reminderLeadMinutes: number | null;
  notifyElder: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  completionNote: string | null;
  cancelNote: string | null;
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    elderId: row.elder_id,
    appointmentType: row.appointment_type,
    state: row.state,
    title: row.title,
    startAt: row.start_at,
    timezone: row.timezone,
    provider: row.provider,
    facility: row.facility,
    location: row.location,
    address: row.address,
    contactPhone: row.contact_phone,
    notes: row.notes,
    reminderLeadMinutes: row.reminder_lead_minutes,
    notifyElder: row.notify_elder,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    completionNote: row.completion_note,
    cancelNote: row.cancel_note,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every appointment for the elder, soonest first. */
export async function listAppointments(elderId: string): Promise<Appointment[]> {
  const { data, error } = await getSupabase()
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('elder_id', elderId)
    .order('start_at', { ascending: true })
    .returns<AppointmentRow[]>();

  if (error) throw new Error('Could not load the appointments.');
  return data.map(toAppointment);
}

/** One appointment, or `null` when RLS hides it or it no longer exists. */
export async function getAppointment(id: string): Promise<Appointment | null> {
  const { data, error } = await getSupabase()
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle<AppointmentRow>();

  if (error) throw new Error('Could not load the appointment.');
  return data ? toAppointment(data) : null;
}

// ---------------------------------------------------------------------------
// Writes (guarded RPCs only)
// ---------------------------------------------------------------------------

interface PostgrestError {
  code?: string;
  message: string;
}

/**
 * Turns a PostgREST error into something safe to show. The server's raised strings are
 * developer-facing, so they are never rendered.
 */
export function appointmentWriteError(error: PostgrestError, fallback: string): Error {
  if (error.code === '42501') return new Error('Only the linked caregiver can change this.');
  if (error.code === '23514') {
    return new Error('Some details are not valid. Check the form and try again.');
  }
  if (error.code === 'P0002') {
    return new Error('That appointment no longer exists. Refresh and try again.');
  }
  return new Error(fallback);
}

function writeParams(input: AppointmentWrite) {
  return {
    p_appointment_type: input.appointmentType,
    p_title: input.title,
    p_start_date: input.startDate,
    p_start_time: input.startTime,
    p_timezone: input.timezone,
    p_provider: input.provider,
    p_facility: input.facility,
    p_location: input.location,
    p_address: input.address,
    p_contact_phone: input.contactPhone,
    p_notes: input.notes,
    p_reminder_lead_minutes: input.reminderLeadMinutes,
    p_notify_elder: input.notifyElder,
  };
}

export async function createAppointment(elderId: string, input: AppointmentWrite): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_appointment', {
    p_elder_id: elderId,
    ...writeParams(input),
  });

  if (error) throw appointmentWriteError(error, 'Could not save the appointment.');
  return data as string;
}

export async function updateAppointment(id: string, input: AppointmentWrite): Promise<void> {
  const { error } = await getSupabase().rpc('update_appointment', {
    p_id: id,
    ...writeParams(input),
  });

  if (error) throw appointmentWriteError(error, 'Could not save the appointment.');
}

export async function completeAppointment(id: string, note?: string): Promise<void> {
  const { error } = await getSupabase().rpc('complete_appointment', {
    p_id: id,
    p_note: note && note.trim().length > 0 ? note : null,
  });

  if (error) throw appointmentWriteError(error, 'Could not complete the appointment.');
}

export async function cancelAppointment(id: string, note?: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_appointment', {
    p_id: id,
    p_note: note && note.trim().length > 0 ? note : null,
  });

  if (error) throw appointmentWriteError(error, 'Could not cancel the appointment.');
}

// ---------------------------------------------------------------------------
// Derived helpers for the screens
// ---------------------------------------------------------------------------

/**
 * Split the elder's appointments for the list. The Upcoming tab holds every unresolved
 * appointment — including a past one, which shows an Overdue badge (owner decision 2026-10-06) —
 * soonest first; the Past tab holds the terminal states, most recent first.
 */
export function splitAppointments(appointments: Appointment[]): {
  upcoming: Appointment[];
  past: Appointment[];
} {
  const upcoming = appointments
    .filter((appointment) => appointment.state === 'upcoming')
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = appointments
    .filter((appointment) => appointment.state !== 'upcoming')
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  return { upcoming, past };
}

/** The soonest appointment still ahead of `now`, for the dashboard card. */
export function nextAppointment(
  appointments: Appointment[],
  now: Date = new Date(),
): Appointment | null {
  const ahead = appointments
    .filter(
      (appointment) =>
        appointment.state === 'upcoming' &&
        new Date(appointment.startAt).getTime() >= now.getTime(),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  return ahead[0] ?? null;
}
