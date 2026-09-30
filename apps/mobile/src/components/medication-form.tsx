import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  batchInputSchema,
  canonicalizeDaysOfWeek,
  CUSTOM_DOSE_UNIT,
  DEFAULT_GRACE_MINUTES,
  doseUnitLabels,
  doseUnitSchema,
  graceMinutesSchema,
  MAX_DOSE_UNIT_LENGTH,
  MAX_MEDICATION_LABEL_LENGTH,
  MAX_MEDICATION_TEXT_LENGTH,
  MAX_STOCK_AMOUNT,
  medicationFormLabels,
  medicationFormSchema,
  medicationInputSchema,
  resolveDoseUnit,
  scheduleInputSchema,
  weekdayShortLabels,
  type BatchInput,
  type DoseUnit,
  type MedicationForm as MedicationFormKind,
  type MedicationInput,
  type ScheduleInput,
} from '@eldercare/shared';

import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChips } from '@/components/choice-chips';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { TimeField } from '@/components/time-field';
import {
  createBatch,
  createMedication,
  createSchedule,
  isDuplicateMedicineName,
  isDuplicateSchedule,
  setMedicationActive,
  updateBatch,
  updateMedication,
  updateSchedule,
  type Medication,
  type MedicationSchedule,
  type MedicineBatch,
} from '@/db';
import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  touchTarget,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { toIsoDay } from '@/lib/format';

/**
 * `C-03` Add / Edit Medication - the single write surface for a medication plan
 * (docs/specs/sprint-3.md).
 *
 * Labels, section headings and the primary action come from the approved `C-03` wireframe
 * (`Add medication`, `Medication name`, `Strength / form`, `Instructions`, `SCHEDULE DATES`,
 * `Start date`, `End date`, `DOSE AND TIMES`, `Dose amount`, `Time`, `Repeat days`,
 * `Grace period`, `30 minutes`, `Save medication`). Everything else here - the unit and form
 * chip values, the weekday abbreviations, the validation sentences and the two warnings - had
 * no approved source and were escalated to the owner, who approved them in bulk on 2026-09-30
 * (`src/fixtures/copy-sources.ts`, now `owner-approved`).
 *
 * The database is the authority: this form validates inline for the caregiver, then assembles the
 * payload through the same zod schemas the RPC mirrors, and the RPCs re-check every rule.
 */

/** Owner-approved 2026-09-30. Kept together so the ledger can be checked at a glance. */
const REQUIRED_NAME = 'Enter the medication name';
const REQUIRED_STRENGTH = 'Enter the strength and form';
const REQUIRED_INSTRUCTIONS = 'Enter the instructions';
const REQUIRED_DOSE = 'Enter the dose amount';
const REQUIRED_UNIT = 'Choose a unit, or type one for Other';
const REQUIRED_START = 'Choose a start date';
const END_BEFORE_START = 'The end date cannot be before the start date';
const REQUIRED_DAYS = 'Choose at least one repeat day';
const REQUIRED_TIME = 'Choose a time';
const REQUIRED_BATCH_QUANTITY = 'Enter the quantity in the pack';
const REQUIRED_BATCH_UNIT = 'Enter the unit written on the pack';
const REQUIRED_BATCH_EXPIRY = 'Choose the expiry date';
const BATCH_UNIT_MISMATCH =
  'This differs from the dose unit, so stock will not reduce automatically.';

/** Escalated to the owner (2026-09-30) with the validation-hardening fix. */
const AMOUNT_TOO_LARGE = 'Enter a smaller amount';
const EXPIRY_IN_PAST = 'Choose an expiry date that has not passed';

/** The wireframe draws `30 minutes`; these are the same pattern at the allowed step. */
const GRACE_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

interface MedicationFormState {
  name: string;
  strength: string;
  form: MedicationFormKind;
  doseQuantity: string;
  doseUnit: DoseUnit;
  customUnit: string;
  instructions: string;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  timeOfDay: string;
  graceMinutes: number;
  hasBatch: boolean;
  batchQuantity: string;
  batchUnit: string;
  batchLot: string;
  batchExpiry: string;
  batchThreshold: string;
  batchRefill: string;
}

type FormErrors = Partial<Record<keyof MedicationFormState, string>>;

export interface MedicationFormInitial {
  medication: Medication;
  /** Every schedule for the medication; the form edits the first. */
  schedules: MedicationSchedule[];
  /** Every batch for the medication; the form edits the active one, else the first. */
  batches: MedicineBatch[];
}

interface MedicationFormProps {
  /** The elder the created medicine belongs to; ignored when editing. */
  elderId: string;
  /** `null` creates; a stored plan edits. */
  initial: MedicationFormInitial | null;
  /** The medicines already on this elder's plan, for the duplicate warning. */
  existing: Medication[];
  /** `Save medication` (C-03) - the approved wireframe primary action. */
  submitLabel: string;
  onSaved: (medicationId: string) => void;
}

function blankOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function initialState(initial: MedicationFormInitial | null): MedicationFormState {
  const medication = initial?.medication ?? null;
  const schedule = initial?.schedules.at(0) ?? null;
  const batch = initial?.batches.find((row) => row.isActive) ?? initial?.batches.at(0) ?? null;

  return {
    name: medication?.name ?? '',
    strength: medication?.strength ?? '',
    // `form` is optional in the column, but the chip group always shows a selection; the
    // caregiver sees which one before saving, so nothing is assumed silently.
    form: medication?.form ?? 'tablet',
    // `numeric(10,3)`; drop a trailing `.000` so the field reads `1`, not `1.000`.
    doseQuantity: medication ? `${Number(medication.doseQuantity)}` : '',
    doseUnit: ((): DoseUnit => {
      const stored = medication?.doseUnit;
      if (!stored) return 'tablet';
      return (doseUnitSchema.options as readonly string[]).includes(stored)
        ? (stored as DoseUnit)
        : CUSTOM_DOSE_UNIT;
    })(),
    customUnit:
      medication && !(doseUnitSchema.options as readonly string[]).includes(medication.doseUnit)
        ? medication.doseUnit
        : '',
    instructions: medication?.instructions ?? '',
    startDate: medication?.startDate ?? '',
    endDate: medication?.endDate ?? '',
    daysOfWeek: schedule?.daysOfWeek ?? [],
    timeOfDay: schedule?.timeOfDay ?? '',
    graceMinutes: schedule?.graceMinutes ?? DEFAULT_GRACE_MINUTES,
    hasBatch: batch !== null,
    batchQuantity: batch ? `${Number(batch.quantity)}` : '',
    batchUnit: batch?.unit ?? '',
    batchLot: batch?.lotNumber ?? '',
    batchExpiry: batch?.expiryDate ?? '',
    batchThreshold:
      batch?.lowStockThreshold === null || batch?.lowStockThreshold === undefined
        ? ''
        : `${Number(batch.lowStockThreshold)}`,
    batchRefill: batch?.refillContact ?? '',
  };
}

export function MedicationForm({
  elderId,
  initial,
  existing,
  submitLabel,
  onSaved,
}: MedicationFormProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [form, setForm] = useState<MedicationFormState>(() => initialState(initial));
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: BannerTone; message: string } | null>(null);

  /** The row this form edits, if any: the first schedule and the active (else first) batch. */
  const editedSchedule = initial?.schedules.at(0) ?? null;
  const editedBatch =
    initial?.batches.find((row) => row.isActive) ?? initial?.batches.at(0) ?? null;

  const unitOptions = useMemo(
    () => doseUnitSchema.options.map((value) => ({ value, label: doseUnitLabels[value] })),
    [],
  );

  const formOptions = useMemo(
    () =>
      medicationFormSchema.options.map((value) => ({
        value,
        label: medicationFormLabels[value],
      })),
    [],
  );

  const graceOptions = useMemo(
    () => GRACE_OPTIONS.map((value) => ({ value: `${value}`, label: `${value} minutes` })),
    [],
  );

  /** The unit that will be stored: a listed unit as itself, Other as the caregiver's words. */
  const resolvedUnit = resolveDoseUnit(form.doseUnit, form.customUnit);

  /** Non-blocking: the database has no unique name rule, so the caregiver may still save. */
  const duplicateName = isDuplicateMedicineName(existing, form.name, initial?.medication.id);

  function set<K extends keyof MedicationFormState>(key: K, value: MedicationFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day],
    }));
  }

  /** Assembles the three payloads, or returns the inline errors that block the save. */
  function validate(): {
    medication: MedicationInput;
    schedule: ScheduleInput;
    batch: BatchInput | null;
    errors: FormErrors;
  } {
    const nextErrors: FormErrors = {};

    if (form.name.trim().length === 0) nextErrors.name = REQUIRED_NAME;
    if (form.strength.trim().length === 0) nextErrors.strength = REQUIRED_STRENGTH;
    if (form.instructions.trim().length === 0) {
      nextErrors.instructions = REQUIRED_INSTRUCTIONS;
    }

    const doseQuantity = Number(form.doseQuantity);
    if (
      form.doseQuantity.trim().length === 0 ||
      !Number.isFinite(doseQuantity) ||
      doseQuantity <= 0
    ) {
      nextErrors.doseQuantity = REQUIRED_DOSE;
    } else if (doseQuantity > MAX_STOCK_AMOUNT) {
      nextErrors.doseQuantity = AMOUNT_TOO_LARGE;
    }
    if (resolvedUnit === null) nextErrors.customUnit = REQUIRED_UNIT;

    if (form.startDate.length === 0) nextErrors.startDate = REQUIRED_START;
    if (form.endDate.length > 0 && form.endDate < form.startDate) {
      nextErrors.endDate = END_BEFORE_START;
    }

    if (form.daysOfWeek.length === 0) nextErrors.daysOfWeek = REQUIRED_DAYS;
    if (form.timeOfDay.length === 0) nextErrors.timeOfDay = REQUIRED_TIME;

    const batchQuantity = Number(form.batchQuantity);
    if (
      form.hasBatch &&
      (form.batchQuantity.trim().length === 0 ||
        !Number.isFinite(batchQuantity) ||
        batchQuantity < 0)
    ) {
      nextErrors.batchQuantity = REQUIRED_BATCH_QUANTITY;
    } else if (form.hasBatch && batchQuantity > MAX_STOCK_AMOUNT) {
      nextErrors.batchQuantity = AMOUNT_TOO_LARGE;
    }
    if (form.hasBatch && form.batchUnit.trim().length === 0) {
      nextErrors.batchUnit = REQUIRED_BATCH_UNIT;
    }
    if (form.hasBatch && form.batchExpiry.length === 0) {
      nextErrors.batchExpiry = REQUIRED_BATCH_EXPIRY;
    } else if (form.hasBatch && form.batchExpiry < toIsoDay(new Date())) {
      // The server rejects an already-expired batch; say it inline first.
      nextErrors.batchExpiry = EXPIRY_IN_PAST;
    }

    const thresholdField = form.batchThreshold.trim();
    const thresholdValue = thresholdField.length === 0 ? Number.NaN : Number(thresholdField);
    if (form.hasBatch && Number.isFinite(thresholdValue) && thresholdValue > MAX_STOCK_AMOUNT) {
      nextErrors.batchThreshold = AMOUNT_TOO_LARGE;
    }

    setErrors(nextErrors);

    const medication: MedicationInput = {
      name: form.name.trim(),
      strength: form.strength.trim(),
      form: form.form,
      doseQuantity: Number.isFinite(doseQuantity) ? doseQuantity : 0,
      doseUnit: resolvedUnit ?? '',
      instructions: form.instructions.trim(),
      startDate: form.startDate,
      endDate: blankOrNull(form.endDate),
    };

    const scheduleInput: ScheduleInput = {
      daysOfWeek: canonicalizeDaysOfWeek(form.daysOfWeek),
      timeOfDay: form.timeOfDay,
      // The caregiver's device zone is the local time the plan should follow; an edit keeps the
      // zone the schedule already stores.
      timezone:
        editedSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      graceMinutes: form.graceMinutes,
    };

    // The partial unique index makes a second active slot identical to another impossible, but the
    // client should warn rather than submit one and let the server pick the message.
    if (
      initial &&
      isDuplicateSchedule(
        initial.schedules,
        initial.medication.id,
        scheduleInput.daysOfWeek,
        scheduleInput.timeOfDay,
        editedSchedule?.id,
      )
    ) {
      nextErrors.daysOfWeek = 'This medication already has a schedule for those days and that time';
    }

    const threshold = form.batchThreshold.trim();
    const batchInput: BatchInput | null = form.hasBatch
      ? {
          quantity: Number.isFinite(batchQuantity) ? batchQuantity : 0,
          unit: form.batchUnit.trim(),
          lotNumber: blankOrNull(form.batchLot),
          expiryDate: form.batchExpiry,
          lowStockThreshold:
            threshold.length === 0 || !Number.isFinite(Number(threshold))
              ? null
              : Number(threshold),
          refillContact: blankOrNull(form.batchRefill),
        }
      : null;

    // The database is the authority; the same schemas run again here so a shape that slipped
    // past the inline checks can never reach an RPC.
    if (
      Object.keys(nextErrors).length === 0 &&
      (!medicationInputSchema.safeParse(medication).success ||
        !scheduleInputSchema.safeParse(scheduleInput).success ||
        (batchInput !== null && !batchInputSchema.safeParse(batchInput).success) ||
        !graceMinutesSchema.safeParse(form.graceMinutes).success)
    ) {
      setFeedback({
        tone: 'error',
        message: 'Some details are not valid. Check the form and try again.',
      });
      return {
        medication,
        schedule: scheduleInput,
        batch: batchInput,
        errors: { name: REQUIRED_NAME },
      };
    }

    return { medication, schedule: scheduleInput, batch: batchInput, errors: nextErrors };
  }

  async function save() {
    const payload = validate();
    if (Object.keys(payload.errors).length > 0) return;

    setBusy(true);
    setFeedback(null);
    try {
      let medicationId: string;

      if (initial) {
        medicationId = initial.medication.id;
        await updateMedication(medicationId, payload.medication);

        if (editedSchedule) {
          await updateSchedule(editedSchedule.id, payload.schedule);
        } else {
          await createSchedule(medicationId, payload.schedule);
          await setMedicationActive(medicationId, true);
        }

        if (payload.batch) {
          if (editedBatch) await updateBatch(editedBatch.id, payload.batch);
          else await createBatch(medicationId, payload.batch, true);
        }
      } else {
        medicationId = await createMedication(elderId, payload.medication);
        await createSchedule(medicationId, payload.schedule);
        // The plan is only complete once it has an active schedule, so it leaves draft here.
        await setMedicationActive(medicationId, true);
        if (payload.batch) await createBatch(medicationId, payload.batch, true);
      }

      onSaved(medicationId);
    } catch (cause: unknown) {
      setFeedback({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'Could not save the medication.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      {duplicateName ? (
        <Banner
          tone="info"
          message={`${form.name.trim()} is already on this elder's plan. You can still save.`}
        />
      ) : null}

      <Card>
        <Field
          label="Medication name"
          value={form.name}
          onChangeText={(value) => set('name', value)}
          error={errors.name}
          maxLength={MAX_MEDICATION_LABEL_LENGTH}
          placeholder="Metformin"
        />
        <Field
          label="Strength / form"
          value={form.strength}
          onChangeText={(value) => set('strength', value)}
          error={errors.strength}
          maxLength={MAX_MEDICATION_LABEL_LENGTH}
          placeholder="500 mg tablet"
        />
        <ChoiceChips
          label="Form"
          options={formOptions}
          value={form.form}
          onChange={(value) => set('form', value)}
        />
        <Field
          label="Instructions"
          value={form.instructions}
          onChangeText={(value) => set('instructions', value)}
          error={errors.instructions}
          maxLength={MAX_MEDICATION_TEXT_LENGTH}
          placeholder="Take 1 tablet after meals"
          multiline
        />
      </Card>

      <Card title="Schedule dates">
        <DateField
          label="Start date"
          value={form.startDate}
          onChange={(value) => set('startDate', value)}
          placeholder="Select date"
          error={errors.startDate}
        />
        <DateField
          label="End date"
          value={form.endDate}
          onChange={(value) => set('endDate', value)}
          placeholder="No end date"
          error={errors.endDate}
          minimumDate={form.startDate ? new Date(`${form.startDate}T00:00:00`) : undefined}
        />
      </Card>

      <Card title="Dose and times">
        <Field
          label="Dose amount"
          value={form.doseQuantity}
          onChangeText={(value) => set('doseQuantity', value)}
          error={errors.doseQuantity}
          placeholder="1"
          keyboardType="decimal-pad"
        />
        <ChoiceChips
          label="Unit"
          options={unitOptions}
          value={form.doseUnit}
          onChange={(value) => set('doseUnit', value)}
        />
        {form.doseUnit === CUSTOM_DOSE_UNIT ? (
          <Field
            label="Type the unit"
            value={form.customUnit}
            onChangeText={(value) => set('customUnit', value)}
            error={errors.customUnit}
            maxLength={MAX_DOSE_UNIT_LENGTH}
            placeholder="teaspoon"
          />
        ) : null}
        <TimeField
          label="Time"
          value={form.timeOfDay}
          onChange={(value) => set('timeOfDay', value)}
          placeholder="Select time"
          error={errors.timeOfDay}
        />

        <View style={styles.daysSection}>
          <Text style={styles.daysLabel}>Repeat days</Text>
          <View style={styles.daysRow} accessibilityRole="list">
            {weekdayShortLabels.map((label, day) => {
              const selected = form.daysOfWeek.includes(day);
              return (
                <Pressable
                  key={label + day}
                  accessibilityRole="checkbox"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleDay(day)}
                  android_ripple={{ color: colors.border }}
                  style={({ pressed }) => [
                    styles.dayChip,
                    selected ? styles.dayChipSelected : null,
                    pressed ? styles.dayChipPressed : null,
                  ]}
                >
                  <Text style={selected ? styles.dayChipTextSelected : styles.dayChipText}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.daysOfWeek ? (
            <View style={styles.errorRow} accessibilityRole="alert">
              <Text style={styles.errorText}>{errors.daysOfWeek}</Text>
            </View>
          ) : null}
        </View>

        <ChoiceChips
          label="Grace period"
          options={graceOptions}
          value={`${form.graceMinutes}`}
          onChange={(value) => set('graceMinutes', Number(value))}
        />
      </Card>

      <Card title="Stock batch">
        <ChoiceChips
          label="Track stock for this medication"
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'Not now' },
          ]}
          value={form.hasBatch ? 'yes' : 'no'}
          onChange={(value) => set('hasBatch', value === 'yes')}
        />

        {form.hasBatch ? (
          <>
            <Field
              label="Quantity in the pack"
              value={form.batchQuantity}
              onChangeText={(value) => set('batchQuantity', value)}
              error={errors.batchQuantity}
              placeholder="30"
              keyboardType="decimal-pad"
            />
            <Field
              label="Unit on the pack"
              value={form.batchUnit}
              onChangeText={(value) => set('batchUnit', value)}
              error={errors.batchUnit}
              maxLength={MAX_DOSE_UNIT_LENGTH}
              placeholder="tablet"
            />
            {form.batchUnit.trim().length > 0 &&
            resolvedUnit !== null &&
            form.batchUnit.trim() !== resolvedUnit ? (
              <Banner tone="info" message={BATCH_UNIT_MISMATCH} />
            ) : null}
            <Field
              label="Lot number"
              value={form.batchLot}
              onChangeText={(value) => set('batchLot', value)}
              maxLength={MAX_DOSE_UNIT_LENGTH}
              placeholder="LOT-A1"
            />
            <DateField
              label="Expiry date"
              value={form.batchExpiry}
              onChange={(value) => set('batchExpiry', value)}
              placeholder="Select date"
              error={errors.batchExpiry}
              minimumDate={new Date()}
            />
            <Field
              label="Low-stock threshold"
              value={form.batchThreshold}
              onChangeText={(value) => set('batchThreshold', value)}
              error={errors.batchThreshold}
              placeholder="7"
              keyboardType="decimal-pad"
            />
            <Field
              label="Refill contact"
              value={form.batchRefill}
              onChangeText={(value) => set('batchRefill', value)}
              maxLength={MAX_MEDICATION_LABEL_LENGTH}
              placeholder="Night Pharmacy"
            />
          </>
        ) : null}
      </Card>

      <Button label={submitLabel} onPress={() => void save()} loading={busy} />
    </>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    daysSection: {
      gap: spacing.xs,
    },
    daysLabel: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '600',
      lineHeight: lineHeight.caption,
    },
    daysRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    dayChip: {
      alignItems: 'center',
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: touchTarget.min,
      minWidth: touchTarget.min,
      paddingHorizontal: spacing.sm,
    },
    dayChipSelected: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.primary,
    },
    dayChipPressed: {
      opacity: 0.85,
    },
    dayChipText: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    dayChipTextSelected: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    errorRow: {
      flexDirection: 'row',
    },
    errorText: {
      color: colors.danger,
      flex: 1,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
