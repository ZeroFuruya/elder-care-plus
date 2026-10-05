import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

/**
 * Device-calendar export (docs/specs/sprint-7.md, OD5).
 *
 * This is the only place the app talks to `expo-calendar`. It is deliberately defensive: the demo
 * build runs on an Android APK, but the same bundle must not crash in an environment where the
 * module or the permission is unavailable. Every entry point fails soft — the caller hides or
 * explains the control rather than throwing on render.
 */

export type CalendarPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Web has no device calendar; the button is hidden there. */
export function deviceCalendarSupported(): boolean {
  return Platform.OS !== 'web';
}

/**
 * The current permission **without prompting**, or `null` when the platform cannot answer. Called on
 * mount so the export button is only offered when it can plausibly work; the actual prompt happens
 * when the user taps, in context.
 */
export async function calendarPermissionStatus(): Promise<CalendarPermissionStatus | null> {
  if (!deviceCalendarSupported()) return null;
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    return status;
  } catch {
    return null;
  }
}

async function writableCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((calendar) => calendar.allowsModifications);
  return writable?.id ?? null;
}

export interface CalendarEventInput {
  title: string;
  /** The stored UTC instant. */
  startAt: string;
  /** The IANA zone the appointment was recorded in, so the device shows the intended wall-clock. */
  timezone: string;
  location: string | null;
  notes: string | null;
}

/**
 * Add the appointment as a one-hour event. Requests permission if it has not been decided, picks the
 * first writable calendar, and throws a short, safe sentence the screen can show if it cannot.
 */
export async function addAppointmentToDeviceCalendar(input: CalendarEventInput): Promise<void> {
  if (!deviceCalendarSupported()) throw new Error('This device has no calendar.');

  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new Error('Calendar access was not granted.');

  const calendarId = await writableCalendarId();
  if (!calendarId) throw new Error('No calendar on this device can be written to.');

  const start = new Date(input.startAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  await Calendar.createEventAsync(calendarId, {
    title: input.title,
    startDate: start,
    endDate: end,
    timeZone: input.timezone,
    location: input.location ?? undefined,
    notes: input.notes ?? undefined,
  });
}
