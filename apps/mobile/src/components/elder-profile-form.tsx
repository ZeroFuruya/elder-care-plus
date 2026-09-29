import { useMemo, useState } from 'react';

import {
  bloodTypeLabels,
  bloodTypeSchema,
  MIN_PHONE_DIGITS,
  phoneLooksValid,
  type BloodType,
} from '@eldercare/shared';

import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChips } from '@/components/choice-chips';
import { Field } from '@/components/field';
import { upsertElderProfile, type ElderProfile } from '@/db';

/**
 * The elder-profile fields shared by `A-09` Create Elder Profile and `C-11` Edit Elder Profile
 * (docs/specs/sprint-2.md). Both screens are the same form; only the initial values and the
 * primary-action label differ, so the write path and its validation exist once.
 *
 * Labels, section headings and the primary action come from the approved wireframes
 * (`Create elder profile`, `IDENTITY`, `MEDICAL SUMMARY`, `Birth date`, `Blood type`,
 * `Conditions`, `Allergies`, `Care instructions`, `Primary doctor`, `Save and continue`,
 * `Save changes`). Free-text fields repeat the caregiver's words back exactly and are never
 * paraphrased (docs/02-ui-ux-standard.md section 10).
 */

/** Verbatim from `emergencyNumberInputSchema` in `@eldercare/shared`. */
const PHONE_ERROR = `Enter a phone number with at least ${MIN_PHONE_DIGITS} digits`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ProfileFormState {
  dateOfBirth: string;
  bloodType: BloodType;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  allergies: string;
  conditions: string;
  careInstructions: string;
  doctorName: string;
  doctorPhone: string;
}

type FormErrors = Partial<Record<keyof ProfileFormState, string>>;

function initialState(profile: ElderProfile | null): ProfileFormState {
  return {
    dateOfBirth: profile?.dateOfBirth ?? '',
    bloodType: profile?.bloodType ?? 'unknown',
    addressLine1: profile?.addressLine1 ?? '',
    addressLine2: profile?.addressLine2 ?? '',
    city: profile?.city ?? '',
    region: profile?.region ?? '',
    postalCode: profile?.postalCode ?? '',
    country: profile?.countryCode ?? '',
    allergies: profile?.allergies ?? '',
    conditions: profile?.conditions ?? '',
    careInstructions: profile?.careInstructions ?? '',
    doctorName: profile?.doctorName ?? '',
    doctorPhone: profile?.doctorPhone ?? '',
  };
}

/** An absent optional field stays a genuine `null`; a blank string is never stored. */
function blankOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** `date` columns accept `YYYY-MM-DD`; the round trip rejects rolled-over dates like 2026-02-30. */
function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const [year, month, day] = value.split('-').map(Number);
  return (
    parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day
  );
}

function validateField(key: keyof ProfileFormState, value: string): string | undefined {
  if (key === 'dateOfBirth') {
    if (value.trim().length === 0) return undefined;
    return isValidDate(value.trim()) ? undefined : 'Enter the date as YYYY-MM-DD.';
  }

  if (key === 'doctorPhone') {
    if (value.trim().length === 0) return undefined;
    return phoneLooksValid(value) ? undefined : PHONE_ERROR;
  }

  return undefined;
}

interface ElderProfileFormProps {
  elderId: string;
  /** The stored profile, or `null` while creating one (A-09). */
  initial: ElderProfile | null;
  /** `Save and continue` (A-09) or `Save changes` (C-11) — both from the approved wireframes. */
  submitLabel: string;
  /** Section heading: `Doctor and emergency` (A-09) or `Doctor` (C-11). */
  doctorSectionTitle: string;
  onSaved: () => void;
}

export function ElderProfileForm({
  elderId,
  initial,
  submitLabel,
  doctorSectionTitle,
  onSaved,
}: ElderProfileFormProps) {
  const [form, setForm] = useState<ProfileFormState>(() => initialState(initial));
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: BannerTone; message: string } | null>(null);

  const bloodTypeOptions = useMemo(
    () => bloodTypeSchema.options.map((value) => ({ value, label: bloodTypeLabels[value] })),
    [],
  );

  function set<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Validate on blur, never on every keystroke (docs/02-ui-ux-standard.md section 11). */
  function handleBlur(key: keyof ProfileFormState) {
    const message = validateField(key, form[key]);
    setErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  async function save() {
    const nextErrors: FormErrors = {};
    for (const key of Object.keys(form) as (keyof ProfileFormState)[]) {
      const message = validateField(key, form[key]);
      if (message) nextErrors[key] = message;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    setFeedback(null);
    try {
      await upsertElderProfile({
        elderId,
        dateOfBirth: blankOrNull(form.dateOfBirth),
        bloodType: form.bloodType,
        addressLine1: blankOrNull(form.addressLine1),
        addressLine2: blankOrNull(form.addressLine2),
        city: blankOrNull(form.city),
        region: blankOrNull(form.region),
        postalCode: blankOrNull(form.postalCode),
        countryCode: blankOrNull(form.country),
        allergies: blankOrNull(form.allergies),
        conditions: blankOrNull(form.conditions),
        careInstructions: blankOrNull(form.careInstructions),
        doctorName: blankOrNull(form.doctorName),
        doctorPhone: blankOrNull(form.doctorPhone),
      });
      onSaved();
    } catch (cause: unknown) {
      setFeedback({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'Could not save the elder profile.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <Card title="Identity">
        <Field
          label="Birth date"
          value={form.dateOfBirth}
          onChangeText={(value) => set('dateOfBirth', value)}
          onBlur={() => handleBlur('dateOfBirth')}
          error={errors.dateOfBirth}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoComplete="birthdate-full"
        />
        <ChoiceChips
          label="Blood type"
          options={bloodTypeOptions}
          value={form.bloodType}
          onChange={(value) => set('bloodType', value)}
        />
      </Card>

      <Card title="Medical summary">
        <Field
          label="Conditions"
          value={form.conditions}
          onChangeText={(value) => set('conditions', value)}
          multiline
        />
        <Field
          label="Allergies"
          value={form.allergies}
          onChangeText={(value) => set('allergies', value)}
          multiline
        />
        <Field
          label="Care instructions"
          value={form.careInstructions}
          onChangeText={(value) => set('careInstructions', value)}
          multiline
        />
      </Card>

      <Card title={doctorSectionTitle}>
        <Field
          label="Primary doctor"
          value={form.doctorName}
          onChangeText={(value) => set('doctorName', value)}
          autoComplete="name"
        />
        <Field
          label="Phone number"
          value={form.doctorPhone}
          onChangeText={(value) => set('doctorPhone', value)}
          onBlur={() => handleBlur('doctorPhone')}
          error={errors.doctorPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
      </Card>

      <Card title="Address">
        <Field
          label="Address line 1"
          value={form.addressLine1}
          onChangeText={(value) => set('addressLine1', value)}
          autoComplete="street-address"
        />
        <Field
          label="Address line 2"
          value={form.addressLine2}
          onChangeText={(value) => set('addressLine2', value)}
        />
        <Field label="City" value={form.city} onChangeText={(value) => set('city', value)} />
        <Field label="Region" value={form.region} onChangeText={(value) => set('region', value)} />
        <Field
          label="Postal code"
          value={form.postalCode}
          onChangeText={(value) => set('postalCode', value)}
          autoComplete="postal-code"
        />
        <Field
          label="Country"
          value={form.country}
          onChangeText={(value) => set('country', value)}
          autoComplete="country"
        />
      </Card>

      <Button label={submitLabel} onPress={() => void save()} loading={busy} />
    </>
  );
}
