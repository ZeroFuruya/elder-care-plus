import { describe, expect, it } from 'vitest';

import {
  auditActionLabel,
  auditActionLabels,
  auditTargetLabel,
  describeAuditEvent,
} from './index';

/**
 * Sprint 9 care-activity presenter (docs/specs/sprint-9.md, C-12).
 *
 * The audit summary is free-form jsonb, so the presenter must be bounded: a
 * closed action map, a safe fallback that never echoes untrusted text, and a
 * type-checked allowlist of detail keys.
 */

describe('auditActionLabel', () => {
  it('names a known action', () => {
    expect(auditActionLabel('dose.confirmed')).toBe('Dose confirmed');
    expect(auditActionLabel('care_link.revoked')).toBe('Care link revoked');
  });

  it('humanises a plain unknown token', () => {
    expect(auditActionLabel('new_thing')).toBe('New thing');
  });

  it('never echoes unsafe or id-like text', () => {
    expect(auditActionLabel('weird action with spaces')).toBe('Care record updated');
    expect(auditActionLabel('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'Care record updated',
    );
    expect(auditActionLabel('{"injected":true}')).toBe('Care record updated');
  });

  it('gives every known action a non-empty label', () => {
    for (const action of Object.keys(auditActionLabels)) {
      expect(auditActionLabel(action).length).toBeGreaterThan(0);
    }
  });
});

describe('auditTargetLabel', () => {
  it('names known tables and hides unknown or missing ones', () => {
    expect(auditTargetLabel('care_links')).toBe('Care circle');
    expect(auditTargetLabel('medications')).toBe('Medicine');
    expect(auditTargetLabel('not_a_table')).toBeNull();
    expect(auditTargetLabel(null)).toBeNull();
    expect(auditTargetLabel(undefined)).toBeNull();
  });
});

describe('describeAuditEvent', () => {
  it('renders an allowlisted after-summary detail', () => {
    expect(
      describeAuditEvent({
        action: 'medication.updated',
        afterSummary: { name: 'Amlodipine', quantity: 30, ignored: 'secret' },
      }),
    ).toBe('Medicine updated: name: Amlodipine, quantity: 30');
  });

  it('falls back to the before-summary when there is no after-summary', () => {
    expect(
      describeAuditEvent({
        action: 'medication.deactivated',
        beforeSummary: { status: 'active' },
      }),
    ).toBe('Medicine stopped: status: active');
  });

  it('ignores nested, array and null values and returns the label alone', () => {
    expect(
      describeAuditEvent({
        action: 'medication.updated',
        afterSummary: { name: { nested: true }, status: ['a', 'b'], reason: null },
      }),
    ).toBe('Medicine updated');
    expect(describeAuditEvent({ action: 'dose.confirmed', afterSummary: null })).toBe(
      'Dose confirmed',
    );
    expect(describeAuditEvent({ action: 'dose.confirmed' })).toBe('Dose confirmed');
  });

  it('truncates an over-long value', () => {
    const long = 'x'.repeat(200);
    const rendered = describeAuditEvent({ action: 'dose.confirmed', afterSummary: { name: long } });
    expect(rendered).toBe(`Dose confirmed: name: ${'x'.repeat(80)}`);
  });
});
