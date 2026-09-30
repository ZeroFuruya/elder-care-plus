import type { BloodType, EmergencyCategory, EmergencyNumberInput } from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

import { getLinkedElder } from './care-links';

/**
 * Elder profile and emergency-number access for the Supabase-backed app.
 *
 * Every read is a plain RLS-scoped select: the server decides which rows the signed-in
 * account may see. Every write is a guarded RPC — the client never writes these tables
 * directly, and no query trusts a caller-supplied role (docs/specs/sprint-2.md).
 */

const PROFILE_COLUMNS =
  'elder_id, date_of_birth, blood_type, address_line1, address_line2, city, region, postal_code, country_code, allergies, conditions, care_instructions, doctor_name, doctor_phone, updated_at' as const;

const NUMBER_COLUMNS =
  'id, elder_id, category, label, phone, priority, is_primary, verified_at, is_active' as const;

interface ProfileRow {
  elder_id: string;
  date_of_birth: string | null;
  blood_type: BloodType;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  allergies: string | null;
  conditions: string | null;
  care_instructions: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  updated_at: string;
}

interface NumberRow {
  id: string;
  elder_id: string;
  category: EmergencyCategory;
  label: string;
  phone: string;
  priority: number;
  is_primary: boolean;
  verified_at: string | null;
  is_active: boolean;
}

export interface ElderProfile {
  elderId: string;
  dateOfBirth: string | null;
  bloodType: BloodType;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  allergies: string | null;
  conditions: string | null;
  careInstructions: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  updatedAt: string;
}

export interface EmergencyNumber {
  id: string;
  category: EmergencyCategory;
  label: string;
  phone: string;
  priority: number;
  isPrimary: boolean;
  verifiedAt: string | null;
}

export interface EmergencyInfo {
  profile: ElderProfile | null;
  /** Active numbers only, ordered by priority. */
  numbers: EmergencyNumber[];
}

/** Every field `upsert_elder_profile` accepts, ready to send. */
export interface ElderProfileInput {
  elderId: string;
  dateOfBirth: string | null;
  bloodType: BloodType;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  allergies: string | null;
  conditions: string | null;
  careInstructions: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
}

function toProfile(row: ProfileRow): ElderProfile {
  return {
    elderId: row.elder_id,
    dateOfBirth: row.date_of_birth,
    bloodType: row.blood_type,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    allergies: row.allergies,
    conditions: row.conditions,
    careInstructions: row.care_instructions,
    doctorName: row.doctor_name,
    doctorPhone: row.doctor_phone,
    updatedAt: row.updated_at,
  };
}

function toNumber(row: NumberRow): EmergencyNumber {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    phone: row.phone,
    priority: row.priority,
    isPrimary: row.is_primary,
    verifiedAt: row.verified_at,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getElderProfile(elderId: string): Promise<ElderProfile | null> {
  const { data, error } = await getSupabase()
    .from('elder_profiles')
    .select(PROFILE_COLUMNS)
    .eq('elder_id', elderId)
    .maybeSingle<ProfileRow>();

  if (error) throw new Error('Could not load the elder profile.');
  return data ? toProfile(data) : null;
}

export async function listEmergencyNumbers(elderId: string): Promise<EmergencyNumber[]> {
  const { data, error } = await getSupabase()
    .from('emergency_numbers')
    .select(NUMBER_COLUMNS)
    .eq('elder_id', elderId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .returns<NumberRow[]>();

  if (error) throw new Error('Could not load the emergency numbers.');
  return data.map(toNumber);
}

/** The profile and the ordered active numbers in one pass, for `C-10` and `E-07`. */
export async function getEmergencyInfo(elderId: string): Promise<EmergencyInfo> {
  const [profile, numbers] = await Promise.all([
    getElderProfile(elderId),
    listEmergencyNumbers(elderId),
  ]);
  return { profile, numbers };
}

/**
 * The emergency set is complete only when an active emergency-service number has been
 * verified by the caregiver (docs/specs/sprint-2.md, completeness rule). `numbers` is the
 * active list, so an absent service number means incomplete.
 */
export function isEmergencySetComplete(numbers: EmergencyNumber[]): boolean {
  return numbers.some((number) => number.category === 'emergency_service' && number.verifiedAt);
}

/** The dominant call contact: the flagged primary, else the first by priority. */
export function primaryEmergencyNumber(numbers: EmergencyNumber[]): EmergencyNumber | null {
  return numbers.find((number) => number.isPrimary) ?? numbers[0] ?? null;
}

/**
 * The stored address as display lines. Absent parts are dropped rather than replaced with a
 * filler string, so a partial address never claims more than it knows.
 */
export function elderAddressLines(profile: ElderProfile): string {
  return [
    profile.addressLine1,
    profile.addressLine2,
    [profile.city, profile.region, profile.postalCode].filter(Boolean).join(', '),
    profile.countryCode,
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join('\n');
}

/** One load for the caregiver screens: who the linked elder is, and their emergency record. */
export interface CaregiverElderRecord {
  elderId: string;
  elderName: string | null;
  profile: ElderProfile | null;
  numbers: EmergencyNumber[];
}

/**
 * The signed-in caregiver's linked elder plus their profile and ordered numbers, for `A-09`,
 * `C-10` and `C-11`. Returns `null` when no active link exists — the screens render the
 * honest empty state rather than inventing a record.
 */
export async function getElderRecordForCaregiver(
  memberId: string,
): Promise<CaregiverElderRecord | null> {
  const link = await getLinkedElder(memberId);
  if (!link) return null;

  const { profile, numbers } = await getEmergencyInfo(link.elderId);
  return { elderId: link.elderId, elderName: link.elderName, profile, numbers };
}

// ---------------------------------------------------------------------------
// Writes (guarded RPCs only)
// ---------------------------------------------------------------------------

interface PostgrestError {
  code?: string;
  message: string;
}

/**
 * Turns a PostgREST error into a message safe to show. The server's raised strings are
 * developer-facing, so they are never rendered; the client validates first and this is the
 * fallback (docs/specs/sprint-2.md).
 */
export function emergencyWriteError(error: PostgrestError, fallback: string): Error {
  if (error.code === '42501') return new Error('Only the linked caregiver can change this.');
  if (error.code === '23505') {
    return new Error(
      'Another contact already uses that category or position. Refresh and try again.',
    );
  }
  if (error.code === '23514') {
    return new Error('Some details are not valid. Check the form and try again.');
  }
  if (error.code === 'P0002') {
    return new Error('That emergency number no longer exists. Refresh and try again.');
  }
  return new Error(fallback);
}

export async function upsertElderProfile(input: ElderProfileInput): Promise<void> {
  const { error } = await getSupabase().rpc('upsert_elder_profile', {
    p_elder_id: input.elderId,
    p_date_of_birth: input.dateOfBirth,
    p_blood_type: input.bloodType,
    p_address_line1: input.addressLine1,
    p_address_line2: input.addressLine2,
    p_city: input.city,
    p_region: input.region,
    p_postal_code: input.postalCode,
    p_country_code: input.countryCode,
    p_allergies: input.allergies,
    p_conditions: input.conditions,
    p_care_instructions: input.careInstructions,
    p_doctor_name: input.doctorName,
    p_doctor_phone: input.doctorPhone,
  });

  if (error) throw emergencyWriteError(error, 'Could not save the elder profile.');
}

export async function upsertEmergencyNumber(
  elderId: string,
  input: EmergencyNumberInput,
  id?: string,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('upsert_emergency_number', {
    p_elder_id: elderId,
    p_category: input.category,
    p_label: input.label,
    p_phone: input.phone,
    p_priority: input.priority,
    p_is_primary: input.isPrimary,
    p_id: id ?? null,
  });

  if (error) throw emergencyWriteError(error, 'Could not save the emergency number.');
  return data as string;
}

export async function reorderEmergencyNumbers(elderId: string, order: string[]): Promise<void> {
  const { error } = await getSupabase().rpc('reorder_emergency_numbers', {
    p_elder_id: elderId,
    p_order: order,
  });

  if (error) throw emergencyWriteError(error, 'Could not save the new order.');
}

export async function setEmergencyNumberVerified(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('set_emergency_number_verified', { p_id: id });

  if (error) throw emergencyWriteError(error, 'Could not verify the emergency number.');
}

export async function deactivateEmergencyNumber(id: string, reason?: string): Promise<void> {
  const { error } = await getSupabase().rpc('deactivate_emergency_number', {
    p_id: id,
    p_reason: reason ?? null,
  });

  if (error) throw emergencyWriteError(error, 'Could not remove the emergency number.');
}
