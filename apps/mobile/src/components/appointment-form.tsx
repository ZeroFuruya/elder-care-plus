import {
  appointmentReminderOptions,
  appointmentTypeLabels,
  appointmentWriteSchema,
  type AppointmentType,
  type AppointmentWrite,
} from '@eldercare/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChips, type ChoiceOption } from '@/components/choice-chips';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { TimeField } from '@/components/time-field';
import { spacing } from '@/constants/theme';
import { createAppointment, updateAppointment, type Appointment } from '@/db';
import { instantToLocalDate, instantToLocalTime } from '@/lib/format';

type LeadKey = 'off' | '60' | '180' | '1440' | '2880';
type YesNo = 'yes' | 'no';

const TYPE_OPTIONS: ChoiceOption<AppointmentType>[] = (
  Object.keys(appointmentTypeLabels) as AppointmentType[]
).map((value) => ({ value, label: appointmentTypeLabels[value] }));

/** Keys are the minutes, or `off`; labels come from the shared option list (one source). */
const LEAD_OPTIONS: ChoiceOption<LeadKey>[] = appointmentReminderOptions.map((option) => ({
  value: (option.minutes === null ? 'off' : `${option.minutes}`) as LeadKey,
  label: option.label,
}));

const YES_NO_OPTIONS: ChoiceOption<YesNo>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export interface AppointmentFormInitial {
  appointmentType: AppointmentType;
  title: string;
  startDate: string;
  startTime: string;
  provider: string;
  facility: string;
  location: string;
  address: string;
  contactPhone: string;
  notes: string;
  leadKey: LeadKey;
  notifyElder: YesNo;
  timezone: string;
}

/** The device's IANA zone, with a safe fallback. The server converts the local time with it. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Seed the form. For a new appointment the date defaults to tomorrow at 09:00 (a sensible
 * starting point), the zone is the device's, and the reminder defaults to 24 hours (owner
 * decision 2026-10-06). For an edit the stored instant is shown back in its own zone.
 */
export function appointmentFormInitial(existing: Appointment | null): AppointmentFormInitial {
  if (!existing) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      appointmentType: 'visit',
      title: '',
      startDate: instantToLocalDate(tomorrow, deviceTimeZone()),
      startTime: '09:00',
      provider: '',
      facility: '',
      location: '',
      address: '',
      contactPhone: '',
      notes: '',
      leadKey: '1440',
      notifyElder: 'yes',
      timezone: deviceTimeZone(),
    };
  }

  return {
    appointmentType: existing.appointmentType,
    title: existing.title,
    startDate: instantToLocalDate(existing.startAt, existing.timezone),
    startTime: instantToLocalTime(existing.startAt, existing.timezone),
    provider: existing.provider ?? '',
    facility: existing.facility ?? '',
    location: existing.location ?? '',
    address: existing.address ?? '',
    contactPhone: existing.contactPhone ?? '',
    notes: existing.notes ?? '',
    leadKey: (existing.reminderLeadMinutes === null
      ? 'off'
      : `${existing.reminderLeadMinutes}`) as LeadKey,
    notifyElder: existing.notifyElder ? 'yes' : 'no',
    timezone: existing.timezone,
  };
}

function leadMinutes(key: LeadKey): AppointmentWrite['reminderLeadMinutes'] {
  return key === 'off' ? null : (Number(key) as AppointmentWrite['reminderLeadMinutes']);
}

interface FieldIssue {
  code: string;
}

function issueMessage(issue: FieldIssue): string {
  if (issue.code === 'too_big') return 'Too long.';
  if (issue.code === 'too_small' || issue.code === 'invalid_string') return 'Required.';
  return 'Required for this appointment type.';
}

interface AppointmentFormProps {
  elderId: string;
  initial: AppointmentFormInitial;
  existing: Appointment | null;
  submitLabel: string;
  onSaved: () => void;
}

/**
 * `C-07` Add / Edit Appointment — the single write surface for appointments
 * (docs/specs/sprint-7.md).
 *
 * The type drives which fields are shown; the shared `appointmentWriteSchema` enforces the same
 * conditional rule the RPC enforces, so a missing facility or contact number is caught before a
 * round trip. The time is sent as a local date + time + zone, never a UTC instant.
 */
export function AppointmentForm({
  elderId,
  initial,
  existing,
  submitLabel,
  onSaved,
}: AppointmentFormProps) {
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(initial.appointmentType);
  const [title, setTitle] = useState(initial.title);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [provider, setProvider] = useState(initial.provider);
  const [facility, setFacility] = useState(initial.facility);
  const [location, setLocation] = useState(initial.location);
  const [address, setAddress] = useState(initial.address);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  const [notes, setNotes] = useState(initial.notes);
  const [lead, setLead] = useState<LeadKey>(initial.leadKey);
  const [notifyElder, setNotifyElder] = useState<YesNo>(initial.notifyElder);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = appointmentWriteSchema.safeParse({
      appointmentType,
      title,
      startDate,
      startTime,
      timezone: initial.timezone,
      provider,
      facility,
      location,
      address,
      contactPhone,
      notes,
      reminderLeadMinutes: leadMinutes(lead),
      notifyElder: notifyElder === 'yes',
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = typeof issue.path[0] === 'string' ? (issue.path[0] as string) : '';
        if (key.length > 0 && !(key in next)) next[key] = issueMessage(issue);
      }
      setErrors(next);
      setFeedback('Some details need attention.');
      return;
    }

    setErrors({});
    setFeedback(null);
    setBusy(true);
    try {
      if (existing) await updateAppointment(existing.id, parsed.data);
      else await createAppointment(elderId, parsed.data);
      onSaved();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Could not save the appointment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      {feedback ? <Banner tone="error" message={feedback} /> : null}

      <Card title="Appointment">
        <ChoiceChips
          label="Type"
          options={TYPE_OPTIONS}
          value={appointmentType}
          onChange={setAppointmentType}
        />
        <Field
          label="Title"
          value={title}
          onChangeText={setTitle}
          error={errors.title}
          placeholder="Cardiology checkup"
        />
        <DateField
          label="Date"
          value={startDate}
          onChange={setStartDate}
          placeholder="Choose a date"
          error={errors.startDate}
        />
        <TimeField
          label="Time"
          value={startTime}
          onChange={setStartTime}
          placeholder="Choose a time"
          error={errors.startTime}
        />
      </Card>

      <Card title="Where and who">
        {appointmentType === 'visit' ? (
          <>
            <Field
              label="Clinic or facility"
              value={facility}
              onChangeText={setFacility}
              error={errors.facility}
              placeholder="Baybay Medical Center"
            />
            <Field
              label="Location"
              value={location}
              onChangeText={setLocation}
              error={errors.location}
              placeholder="Baybay"
            />
            <Field
              label="Doctor or provider (optional)"
              value={provider}
              onChangeText={setProvider}
              error={errors.provider}
              placeholder="Dr. Maria Santos"
            />
          </>
        ) : (
          <>
            <Field
              label="Address"
              value={address}
              onChangeText={setAddress}
              error={errors.address}
              placeholder="12 Mabini Street"
            />
            <Field
              label="Visitor or provider"
              value={provider}
              onChangeText={setProvider}
              error={errors.provider}
              placeholder="Nurse Ana"
            />
            <Field
              label="Contact number"
              value={contactPhone}
              onChangeText={setContactPhone}
              error={errors.contactPhone}
              placeholder="+63 917 123 4567"
              keyboardType="phone-pad"
            />
          </>
        )}
        <Field
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          error={errors.notes}
          placeholder="What to bring, directions…"
          multiline
        />
      </Card>

      <Card title="Reminder">
        <ChoiceChips label="Remind me" options={LEAD_OPTIONS} value={lead} onChange={setLead} />
        <ChoiceChips
          label="Remind the older adult"
          options={YES_NO_OPTIONS}
          value={notifyElder}
          onChange={setNotifyElder}
        />
      </Card>

      <Button label={submitLabel} onPress={() => void submit()} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
});
