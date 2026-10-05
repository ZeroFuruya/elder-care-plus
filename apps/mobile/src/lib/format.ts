import { weekdayShortLabels } from '@eldercare/shared';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function startOfDay(day: DateInput): Date {
  const date = new Date(toDate(day));
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(day: DateInput): Date {
  const date = new Date(toDate(day));
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDays(day: DateInput, days: number): Date {
  const date = new Date(toDate(day));
  date.setDate(date.getDate() + days);
  return date;
}

export function setTime(day: DateInput, hours: number, minutes = 0): Date {
  const date = new Date(toDate(day));
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Parses a bare `HH:MM` or `HH:MM:SS` time-of-day into a Date on the current day.
 *
 * `medication_schedules.time_of_day` stores a `time`, which arrives as `08:00`; `new Date('08:00')`
 * is `Invalid Date` in V8 and Hermes, so a stored schedule time must be parsed explicitly before
 * `formatTime` reads its hours and minutes.
 */
export function parseTimeOfDay(value: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** `8:00 AM` — the standard's time format (`docs/02-ui-ux-standard.md` section 10). */
export function formatTime(value: DateInput): string {
  const date = typeof value === 'string' ? (parseTimeOfDay(value) ?? toDate(value)) : toDate(value);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function formatShortDate(value: DateInput): string {
  const date = toDate(value);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

export function formatLongDate(value: DateInput): string {
  const date = toDate(value);
  return `${DAYS_LONG[date.getDay()]}, ${MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

/** `Aug 8, 2026` — any date that needs a year (docs/02-ui-ux-standard.md section 10). */
export function formatDateWithYear(value: DateInput): string {
  const date = toDate(value);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatDateTime(value: DateInput): string {
  return `${formatShortDate(value)}, ${formatTime(value)}`;
}

/**
 * The wall-clock parts of an instant in a named IANA zone.
 *
 * Sprint 7 stores an appointment's `start_at` as a UTC instant plus its `timezone`, and the form
 * must show the local date and time the caregiver typed. `Intl.DateTimeFormat` is the reverse of
 * the server's `local_dose_timestamp` (instant -> local), which is the direction Hermes supports
 * reliably; the forward direction is why the write contract sends date + time + zone and lets the
 * server compute the instant.
 *
 * If the runtime cannot honour the zone (a stripped-down Hermes build), fall back to the device
 * clock. That fallback is correct whenever the appointment's zone matches the device, and never
 * throws on a screen.
 */
function wallClockParts(value: DateInput, timeZone: string) {
  const date = toDate(value);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = get('hour');
    const minute = get('minute');
    if (year && month && day && hour && minute) return { year, month, day, hour, minute };
  } catch {
    // Fall through to the device clock.
  }
  return {
    year: `${date.getFullYear()}`,
    month: `${date.getMonth() + 1}`.toString().padStart(2, '0'),
    day: `${date.getDate()}`.toString().padStart(2, '0'),
    hour: `${date.getHours()}`.toString().padStart(2, '0'),
    minute: `${date.getMinutes()}`.toString().padStart(2, '0'),
  };
}

/** The local calendar day (`YYYY-MM-DD`) of an instant in a named IANA zone. */
export function instantToLocalDate(value: DateInput, timeZone: string): string {
  const part = wallClockParts(value, timeZone);
  return `${part.year}-${part.month}-${part.day}`;
}

/** The local clock time (`HH:MM`) of an instant in a named IANA zone. */
export function instantToLocalTime(value: DateInput, timeZone: string): string {
  const part = wallClockParts(value, timeZone);
  return `${part.hour}:${part.minute}`;
}

/** `Oct 8, 2026, 10:00 AM` — an instant rendered in the zone it was recorded in. */
export function formatInstantInZone(value: DateInput, timeZone: string): string {
  const day = instantToLocalDate(value, timeZone);
  const time = instantToLocalTime(value, timeZone);
  return `${formatDateWithYear(new Date(`${day}T00:00:00`))}, ${formatTime(time)}`;
}

export function isSameDay(a: DateInput, b: DateInput): boolean {
  const left = toDate(a);
  const right = toDate(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * A `date` column arrives as `YYYY-MM-DD`. Parse it at local midnight — `new Date('1958-05-08')`
 * is UTC midnight and can render as the previous day west of Greenwich.
 */
export function parseDayOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/**
 * A local `YYYY-MM-DD` day — the shape the `date` columns store. Built from the local parts, never
 * `toISOString()`, which shifts west of Greenwich to the previous day.
 */
export function toIsoDay(value: DateInput): string {
  const date = toDate(value);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `just now`, `12 min ago`, `3 hr ago`, `Aug 12`. */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - toDate(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hr ago`;

  return formatShortDate(value);
}

export function greeting(now: Date = new Date()): string {
  const hours = now.getHours();
  if (hours < 12) return 'Good morning';
  if (hours < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * `Mon Tue Wed Thu Fri` - the weekday abbreviations the approved `C-04` wireframe draws, in the
 * `days_of_week` 0-6 order. An empty set renders as an empty string, never a stand-in word.
 */
export function formatDaysOfWeek(days: readonly number[]): string {
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((day) => weekdayShortLabels[day] ?? '')
    .filter((label) => label.length > 0)
    .join(' ');
}
