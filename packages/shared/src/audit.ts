/**
 * Sprint 9 care-activity presenter (docs/specs/sprint-9.md, C-12).
 *
 * The audit trail is a free-form `jsonb` record, so the timeline must render it
 * defensively: a **closed** action map for the actions the app emits today, plus a
 * bounded fallback, and a **type-checked** allowlist of summary keys. Raw ids,
 * nested objects and arbitrary JSON are never shown to a non-technical user.
 */

/**
 * Human wording for every `audit_events.action` the app emits today (collected
 * from the migrations). A new action should be added here; until it is, it falls
 * through to the bounded fallback rather than echoing raw text.
 */
export const auditActionLabels: Record<string, string> = {
  'account.deactivated': 'Account deactivated',
  'appointment.cancelled': 'Appointment cancelled',
  'appointment.completed': 'Appointment completed',
  'appointment.created': 'Appointment added',
  'appointment.updated': 'Appointment updated',
  'batch.activated': 'Stock batch activated',
  'batch.created': 'Stock batch added',
  'batch.deactivated': 'Stock batch retired',
  'batch.updated': 'Stock batch updated',
  'care_link.activated': 'Care link activated',
  'care_link.consented': 'Care link consented',
  'care_link.redeemed': 'Care link redeemed',
  'care_link.revoked': 'Care link revoked',
  'care_link_invite.created': 'Care invitation created',
  'care_link_invite.redeem_failed': 'Care invitation attempt failed',
  'dose.confirmed': 'Dose confirmed',
  'dose.missed': 'Dose missed',
  'elder_profile.updated': 'Elder details updated',
  'emergency_number.deactivated': 'Emergency contact retired',
  'emergency_number.upserted': 'Emergency contact updated',
  'emergency_number.verified': 'Emergency contact verified',
  'emergency_numbers.reordered': 'Emergency contacts reordered',
  'inventory.adjusted': 'Stock adjusted',
  'medication.created': 'Medicine added',
  'medication.deactivated': 'Medicine stopped',
  'medication.reactivated': 'Medicine restarted',
  'medication.updated': 'Medicine updated',
  'schedule.created': 'Schedule added',
  'schedule.deactivated': 'Schedule stopped',
  'schedule.reactivated': 'Schedule restarted',
  'schedule.updated': 'Schedule updated',
};

/** The target table's human name, or `null` when it is unknown. */
export const auditTargetLabels: Record<string, string> = {
  appointments: 'Appointment',
  care_link_invites: 'Care connection',
  care_links: 'Care circle',
  dose_events: 'Dose',
  elder_profiles: 'Elder details',
  emergency_numbers: 'Emergency contact',
  inventory_transactions: 'Stock',
  medication_schedules: 'Schedule',
  medications: 'Medicine',
  medicine_batches: 'Stock batch',
  profiles: 'Account',
};

/**
 * Bounded fallback: only a plain machine token (lowercase letters, digits and
 * underscores) is humanised. Anything else — an id, a sentence, JSON — is
 * replaced by a fixed phrase, so untrusted `action` text can never reach the UI.
 */
const SAFE_ACTION = /^[a-z0-9_]+$/;

export function auditActionLabel(action: string): string {
  const known = auditActionLabels[action];
  if (known) return known;

  if (typeof action === 'string' && SAFE_ACTION.test(action)) {
    const words = action.replace(/_+/g, ' ').trim();
    if (words.length > 0) return words.charAt(0).toUpperCase() + words.slice(1);
  }

  return 'Care record updated';
}

export function auditTargetLabel(targetTable: string | null | undefined): string | null {
  if (typeof targetTable !== 'string') return null;
  return auditTargetLabels[targetTable] ?? null;
}

/** The summary keys that are safe to surface, in display order. */
const DETAIL_KEYS = ['name', 'state', 'status', 'reason', 'quantity'] as const;

const MAX_DETAIL_VALUE = 80;

function detailValue(summary: unknown): string | null {
  if (summary === null || typeof summary !== 'object' || Array.isArray(summary)) return null;

  const record = summary as Record<string, unknown>;
  const parts: string[] = [];

  for (const key of DETAIL_KEYS) {
    const value = record[key];
    let text: string | null = null;
    if (typeof value === 'string') text = value;
    else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);

    if (text === null) continue;
    const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_VALUE);
    if (trimmed.length > 0) parts.push(`${key}: ${trimmed}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

export interface AuditEventLike {
  action: string;
  targetTable?: string | null;
  beforeSummary?: unknown;
  afterSummary?: unknown;
}

/**
 * A short plain-language line for one audited event: the action label, plus an
 * allowlisted "what changed" taken from the after-summary (or the before-summary
 * when there is no after-summary, e.g. a retirement).
 */
export function describeAuditEvent(event: AuditEventLike): string {
  const label = auditActionLabel(event.action);
  const detail = detailValue(event.afterSummary) ?? detailValue(event.beforeSummary);
  return detail === null ? label : `${label}: ${detail}`;
}
