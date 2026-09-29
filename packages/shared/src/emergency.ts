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

/** The fields `upsert_emergency_number` accepts, validated before the RPC call. */
export const emergencyNumberInputSchema = z.object({
  category: emergencyCategorySchema,
  label: z.string().trim().min(1, 'A label is required').max(80),
  phone: z
    .string()
    .refine(phoneLooksValid, `Enter a phone number with at least ${MIN_PHONE_DIGITS} digits`),
  priority: z.number().int().min(0),
  isPrimary: z.boolean().default(false),
});
export type EmergencyNumberInput = z.infer<typeof emergencyNumberInputSchema>;
