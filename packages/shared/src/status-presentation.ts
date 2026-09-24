import { z } from 'zod';

import {
  appointmentStateLabels,
  appointmentTypeLabels,
  type AppointmentState,
  type AppointmentType,
} from './appointment';
import { doseStatusLabels, syncStateLabels, type DoseStatus, type SyncState } from './dose';
import { stockStatusLabels, type StockStatus } from './inventory';
import {
  evidenceReviewStatusLabels,
  prescriptionStatusLabels,
  type EvidenceReviewStatus,
  type PrescriptionStatus,
} from './prescription';

/**
 * The status presentation contract (docs/02-ui-ux-standard.md section 6).
 *
 * Product hard rule: status is never conveyed by colour alone. Every value of every status enum
 * therefore needs a human label, an icon, and a semantic tone.
 *
 * `tone` is the **only** thing a screen may use to choose a colour. The tone -> colour mapping
 * lives in exactly one place, `statusColors` in `apps/mobile/src/constants/theme.ts`. A screen
 * that switches on a status value to pick a colour is a defect.
 *
 * `label` is derived from the existing `*Labels` maps so the wording has a single source.
 */
export const statusToneSchema = z.enum(['neutral', 'attention', 'danger', 'success']);
export type StatusTone = z.infer<typeof statusToneSchema>;

/** Semantic icon key, never a font glyph: `packages/shared` stays free of icon libraries. */
export type StatusIcon =
  | 'alarm'
  | 'alert-circle'
  | 'alert-triangle'
  | 'archive'
  | 'calendar'
  | 'calendar-check'
  | 'calendar-x'
  | 'check'
  | 'clock'
  | 'close'
  | 'cube'
  | 'file'
  | 'help'
  | 'home'
  | 'hourglass'
  | 'stethoscope'
  | 'sync'
  | 'trend-down';

export interface StatusPresentation {
  readonly label: string;
  readonly icon: StatusIcon;
  readonly tone: StatusTone;
}

export const doseStatusPresentation = Object.freeze({
  upcoming: { label: doseStatusLabels.upcoming, icon: 'clock', tone: 'neutral' },
  due: { label: doseStatusLabels.due, icon: 'alarm', tone: 'attention' },
  taken: { label: doseStatusLabels.taken, icon: 'check', tone: 'success' },
  missed: { label: doseStatusLabels.missed, icon: 'alert-triangle', tone: 'danger' },
} as const satisfies Record<DoseStatus, StatusPresentation>);

export const syncStatePresentation = Object.freeze({
  synced: { label: syncStateLabels.synced, icon: 'check', tone: 'success' },
  pending: { label: syncStateLabels.pending, icon: 'sync', tone: 'attention' },
} as const satisfies Record<SyncState, StatusPresentation>);

export const stockStatusPresentation = Object.freeze({
  normal: { label: stockStatusLabels.normal, icon: 'cube', tone: 'neutral' },
  low: { label: stockStatusLabels.low, icon: 'trend-down', tone: 'attention' },
  out: { label: stockStatusLabels.out, icon: 'close', tone: 'danger' },
  expiring: { label: stockStatusLabels.expiring, icon: 'hourglass', tone: 'attention' },
  expired: { label: stockStatusLabels.expired, icon: 'alert-circle', tone: 'danger' },
  needs_review: { label: stockStatusLabels.needs_review, icon: 'help', tone: 'attention' },
} as const satisfies Record<StockStatus, StatusPresentation>);

export const appointmentStatePresentation = Object.freeze({
  upcoming: { label: appointmentStateLabels.upcoming, icon: 'calendar', tone: 'neutral' },
  completed: { label: appointmentStateLabels.completed, icon: 'calendar-check', tone: 'success' },
  cancelled: { label: appointmentStateLabels.cancelled, icon: 'calendar-x', tone: 'neutral' },
  overdue: { label: appointmentStateLabels.overdue, icon: 'alert-circle', tone: 'attention' },
} as const satisfies Record<AppointmentState, StatusPresentation>);

export const appointmentTypePresentation = Object.freeze({
  visit: { label: appointmentTypeLabels.visit, icon: 'stethoscope', tone: 'neutral' },
  in_home: { label: appointmentTypeLabels.in_home, icon: 'home', tone: 'neutral' },
} as const satisfies Record<AppointmentType, StatusPresentation>);

export const prescriptionStatusPresentation = Object.freeze({
  draft: { label: prescriptionStatusLabels.draft, icon: 'file', tone: 'neutral' },
  verified: { label: prescriptionStatusLabels.verified, icon: 'check', tone: 'success' },
  expired: { label: prescriptionStatusLabels.expired, icon: 'hourglass', tone: 'danger' },
  archived: { label: prescriptionStatusLabels.archived, icon: 'archive', tone: 'neutral' },
} as const satisfies Record<PrescriptionStatus, StatusPresentation>);

export const evidenceReviewStatusPresentation = Object.freeze({
  pending_review: {
    label: evidenceReviewStatusLabels.pending_review,
    icon: 'clock',
    tone: 'attention',
  },
  verified: { label: evidenceReviewStatusLabels.verified, icon: 'check', tone: 'success' },
  rejected: { label: evidenceReviewStatusLabels.rejected, icon: 'close', tone: 'danger' },
} as const satisfies Record<EvidenceReviewStatus, StatusPresentation>);
