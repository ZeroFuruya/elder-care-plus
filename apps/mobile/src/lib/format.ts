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

/** `8:00 AM` — the standard's time format (`docs/02-ui-ux-standard.md` section 10). */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
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

export function formatDateTime(value: DateInput): string {
  return `${formatShortDate(value)}, ${formatTime(value)}`;
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
