import { describe, expect, it } from 'vitest';

import { appointmentDisplayState, appointmentReminderLabel, appointmentWriteSchema } from './index';

/**
 * Sprint 7 appointment display and validation contracts (docs/specs/sprint-7.md).
 *
 * The write schema mirrors the RPC's conditional-field rule so the C-07 form rejects
 * the same input before a round trip. The display state — a past unresolved
 * appointment reads as `overdue` — is computed on the client because `overdue` is
 * never stored.
 */

describe('appointmentDisplayState', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');

  it('derives overdue for a past unresolved appointment', () => {
    expect(appointmentDisplayState('upcoming', '2026-10-06T11:00:00.000Z', now)).toBe('overdue');
  });

  it('leaves a future upcoming appointment upcoming', () => {
    expect(appointmentDisplayState('upcoming', '2026-10-06T13:00:00.000Z', now)).toBe('upcoming');
  });

  it('never rewrites a terminal state', () => {
    expect(appointmentDisplayState('completed', '2026-10-01T11:00:00.000Z', now)).toBe('completed');
    expect(appointmentDisplayState('cancelled', '2026-10-01T11:00:00.000Z', now)).toBe('cancelled');
  });
});

describe('appointmentReminderLabel', () => {
  it('names each configured lead time', () => {
    expect(appointmentReminderLabel(1440)).toBe('24 hours before');
    expect(appointmentReminderLabel(60)).toBe('1 hour before');
  });

  it('reads a null or unknown lead as no reminder', () => {
    expect(appointmentReminderLabel(null)).toBe('No reminder');
    expect(appointmentReminderLabel(999)).toBe('No reminder');
  });
});

const base = {
  appointmentType: 'visit' as const,
  title: 'Cardiology checkup',
  startDate: '2026-10-08',
  startTime: '10:00',
  timezone: 'Asia/Singapore',
  provider: 'Dr. Maria Santos',
  facility: 'Baybay Medical Center',
  location: 'Baybay',
  address: null,
  contactPhone: null,
  notes: null,
  reminderLeadMinutes: 1440 as const,
  notifyElder: true,
};

describe('appointmentWriteSchema', () => {
  it('accepts a complete clinic visit', () => {
    expect(appointmentWriteSchema.safeParse(base).success).toBe(true);
  });

  it('requires the clinic fields for a visit', () => {
    const result = appointmentWriteSchema.safeParse({ ...base, facility: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'facility')).toBe(true);
    }
  });

  it('requires address, visitor and contact for an in-home visit', () => {
    const result = appointmentWriteSchema.safeParse({
      ...base,
      appointmentType: 'in_home',
      facility: null,
      location: null,
      address: '12 Mabini Street',
      provider: 'Nurse Ana',
      contactPhone: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'contactPhone')).toBe(true);
    }
  });

  it('accepts a complete in-home visit', () => {
    const result = appointmentWriteSchema.safeParse({
      ...base,
      appointmentType: 'in_home',
      facility: null,
      location: null,
      address: '12 Mabini Street',
      provider: 'Nurse Ana',
      contactPhone: '+639171234567',
    });
    expect(result.success).toBe(true);
  });

  it('normalizes a blank optional field to null', () => {
    const result = appointmentWriteSchema.safeParse({ ...base, notes: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it('rejects an unsupported reminder lead time', () => {
    expect(appointmentWriteSchema.safeParse({ ...base, reminderLeadMinutes: 45 }).success).toBe(
      false,
    );
  });
});
