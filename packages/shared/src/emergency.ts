import { z } from 'zod';

/**
 * Matches the `elder_profiles.blood_type` check constraint exactly.
 * `unknown` is the honest default: an unreported blood type is never guessed.
 */
export const bloodTypeSchema = z.enum([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'unknown',
]);
export type BloodType = z.infer<typeof bloodTypeSchema>;

/**
 * Abbreviations are written out (docs/02-ui-ux-standard.md section 10): an elder
 * must never have to decode a blood group or guess what `unknown` means.
 */
export const bloodTypeLabels: Record<BloodType, string> = {
  'A+': 'A positive',
  'A-': 'A negative',
  'B+': 'B positive',
  'B-': 'B negative',
  'AB+': 'AB positive',
  'AB-': 'AB negative',
  'O+': 'O positive',
  'O-': 'O negative',
  unknown: 'Not recorded',
};

/** Matches the `emergency_numbers.category` check constraint exactly. */
export const emergencyCategorySchema = z.enum([
  'emergency_service',
  'primary_caregiver',
  'alternate_family',
  'doctor',
  'pharmacy',
]);
export type EmergencyCategory = z.infer<typeof emergencyCategorySchema>;

export const emergencyCategoryLabels: Record<EmergencyCategory, string> = {
  emergency_service: 'Emergency service',
  primary_caregiver: 'Primary caregiver',
  alternate_family: 'Alternate family contact',
  doctor: 'Doctor or clinic',
  pharmacy: 'Pharmacy',
};

/**
 * The database accepts a phone with at least three digits, so short local
 * emergency numbers (`995`, `999`, `112`) work. Keep client and server in step.
 */
export const MIN_PHONE_DIGITS = 3;

export function countPhoneDigits(value: string): number {
  return (value.match(/[0-9]/g) ?? []).length;
}

/**
 * Permissive on purpose: old and short local numbers exist, and the caregiver
 * types the number as it is written locally. Accepts a leading `+`, digits,
 * spaces, hyphens, dots and parentheses; rejects letters and anything with
 * fewer than {@link MIN_PHONE_DIGITS} digits.
 */
export function phoneLooksValid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (!/^\+?[0-9\s().-]+$/.test(trimmed)) return false;
  return countPhoneDigits(trimmed) >= MIN_PHONE_DIGITS;
}

/**
 * The value handed to the dialer: trim, keep a single leading `+`, drop every
 * other non-digit.
 *
 * Derived at call time and never stored. The stored value stays exactly what the
 * caregiver typed, and a phone number is never written to a log
 * (docs/specs/sprint-2.md, audit rules).
 */
export function dialNumber(value: string): string {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  return `${prefix}${trimmed.replace(/[^0-9]/g, '')}`;
}

/**
 * The elder must be an adult (owner decision 2026-09-30): ElderCare+ is a care
 * and record-keeping service for older adults, and a minor's record is out of
 * scope. `1900-01-01` is the plausible floor for a living person. The picker,
 * the caregiver form and the `upsert_elder_profile` RPC share both bounds,
 * exactly as the phone rule is shared.
 */
export const MIN_ELDER_AGE_YEARS = 18;
export const EARLIEST_BIRTH_DATE = '1900-01-01';

/** Bounded free text the elder profile stores, matched by the `elder_profiles` checks. */
export const MAX_ELDER_TEXT_LENGTH = 2000;
export const MAX_ELDER_SHORT_TEXT_LENGTH = 200;
export const MAX_POSTAL_CODE_LENGTH = 32;
export const MAX_COUNTRY_TEXT_LENGTH = 100;
export const MAX_PHONE_LENGTH = 32;

/** One emergency contact: an 80-character label and a priority the column accepts. */
export const MAX_CONTACT_LABEL_LENGTH = 80;
export const MAX_CONTACT_PRIORITY = 999;

/** A local `YYYY-MM-DD` day; never `toISOString()`, which shifts west of Greenwich. */
function toIsoDay(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

export type DateOfBirthIssue = 'future' | 'before_earliest' | 'under_age';

/**
 * Why a well-formed `YYYY-MM-DD` birth date is not acceptable, or `null` when it
 * is. `today` is injectable so the rule is testable without a clock.
 *
 * The checks are ordered so the caregiver is told the real problem: a date in
 * the future, an implausible age, or someone under {@link MIN_ELDER_AGE_YEARS}.
 * Comparison is lexicographic, which is exact for `YYYY-MM-DD`.
 */
export function dateOfBirthIssue(value: string, today: Date = new Date()): DateOfBirthIssue | null {
  if (value > toIsoDay(today)) return 'future';
  if (value < EARLIEST_BIRTH_DATE) return 'before_earliest';
  const latest = new Date(today);
  latest.setFullYear(latest.getFullYear() - MIN_ELDER_AGE_YEARS);
  if (value > toIsoDay(latest)) return 'under_age';
  return null;
}

/** The fields `upsert_emergency_number` accepts, validated before the RPC call. */
export const emergencyNumberInputSchema = z.object({
  category: emergencyCategorySchema,
  label: z.string().trim().min(1, 'A label is required').max(MAX_CONTACT_LABEL_LENGTH),
  phone: z
    .string()
    .max(MAX_PHONE_LENGTH)
    .refine(phoneLooksValid, `Enter a phone number with at least ${MIN_PHONE_DIGITS} digits`),
  priority: z.number().int().min(0).max(MAX_CONTACT_PRIORITY),
  isPrimary: z.boolean().default(false),
});
export type EmergencyNumberInput = z.infer<typeof emergencyNumberInputSchema>;
