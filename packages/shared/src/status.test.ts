import { describe, expect, it } from 'vitest';

import {
  appointmentStateLabels,
  appointmentStatePresentation,
  appointmentStateSchema,
  appointmentTypeLabels,
  appointmentTypePresentation,
  appointmentTypeSchema,
  doseStatusLabels,
  doseStatusPresentation,
  doseStatusSchema,
  evidenceReviewStatusLabels,
  evidenceReviewStatusPresentation,
  evidenceReviewStatusSchema,
  helpRequestCategoryLabels,
  helpRequestCategoryPresentation,
  helpRequestCategorySchema,
  helpRequestStateLabels,
  helpRequestStatePresentation,
  helpRequestStateSchema,
  notificationEventTypeSchema,
  notificationPresentation,
  prescriptionStatusLabels,
  prescriptionStatusPresentation,
  prescriptionStatusSchema,
  statusToneSchema,
  stockStatusLabels,
  stockStatusPresentation,
  stockStatusSchema,
  stockTrackingLabels,
  stockTrackingPresentation,
  stockTrackingSchema,
  syncStateLabels,
  syncStatePresentation,
  syncStateSchema,
  type StatusPresentation,
} from './index';

/**
 * Product hard rule: status is never conveyed by color alone. Every status enum must therefore
 * have a non-empty human-readable label. If someone adds a status without a label, this fails.
 */
describe('status labels', () => {
  const cases = [
    ['dose status', doseStatusSchema.options, doseStatusLabels],
    ['sync state', syncStateSchema.options, syncStateLabels],
    ['stock status', stockStatusSchema.options, stockStatusLabels],
    ['stock tracking', stockTrackingSchema.options, stockTrackingLabels],
    ['appointment state', appointmentStateSchema.options, appointmentStateLabels],
    ['appointment type', appointmentTypeSchema.options, appointmentTypeLabels],
    ['prescription status', prescriptionStatusSchema.options, prescriptionStatusLabels],
    ['evidence review status', evidenceReviewStatusSchema.options, evidenceReviewStatusLabels],
    ['help request category', helpRequestCategorySchema.options, helpRequestCategoryLabels],
    ['help request state', helpRequestStateSchema.options, helpRequestStateLabels],
  ] as const;

  it.each(cases)('%s has a text label for every value', (_name, options, labels) => {
    for (const option of options) {
      const label = (labels as Record<string, string | undefined>)[option];
      expect(label, `missing label for "${option}"`).toBeTruthy();
      expect(label?.trim().length).toBeGreaterThan(0);
    }
  });
});

/**
 * The status presentation contract (docs/02-ui-ux-standard.md section 6). A status added without
 * a presentation, an empty icon, or an unknown tone must break `pnpm test`. The label is derived
 * from the label map above, so this also guards against the two drifting apart.
 */
describe('status presentation', () => {
  const cases = [
    ['dose status', doseStatusSchema.options, doseStatusLabels, doseStatusPresentation],
    ['sync state', syncStateSchema.options, syncStateLabels, syncStatePresentation],
    ['stock status', stockStatusSchema.options, stockStatusLabels, stockStatusPresentation],
    ['stock tracking', stockTrackingSchema.options, stockTrackingLabels, stockTrackingPresentation],
    [
      'appointment state',
      appointmentStateSchema.options,
      appointmentStateLabels,
      appointmentStatePresentation,
    ],
    [
      'appointment type',
      appointmentTypeSchema.options,
      appointmentTypeLabels,
      appointmentTypePresentation,
    ],
    [
      'prescription status',
      prescriptionStatusSchema.options,
      prescriptionStatusLabels,
      prescriptionStatusPresentation,
    ],
    [
      'evidence review status',
      evidenceReviewStatusSchema.options,
      evidenceReviewStatusLabels,
      evidenceReviewStatusPresentation,
    ],
    [
      'help request category',
      helpRequestCategorySchema.options,
      helpRequestCategoryLabels,
      helpRequestCategoryPresentation,
    ],
    [
      'help request state',
      helpRequestStateSchema.options,
      helpRequestStateLabels,
      helpRequestStatePresentation,
    ],
  ] as const;

  it.each(cases)(
    '%s presents every value and nothing else',
    (_name, options, labels, presentations) => {
      expect(Object.keys(presentations).sort()).toEqual([...options].sort());

      for (const option of options) {
        const presentation = (presentations as Record<string, StatusPresentation | undefined>)[
          option
        ];
        expect(presentation, `missing presentation for "${option}"`).toBeDefined();
        expect(presentation?.label, `missing label for "${option}"`).toBe(
          (labels as Record<string, string>)[option],
        );
        expect(presentation?.label.trim().length).toBeGreaterThan(0);
        expect(presentation?.icon.trim().length, `empty icon for "${option}"`).toBeGreaterThan(0);
        expect(
          statusToneSchema.safeParse(presentation?.tone).success,
          `unknown tone for "${option}"`,
        ).toBe(true);
      }
    },
  );
});

/**
 * The notification centre renders an event from `notificationPresentation`. Sprint 5
 * added server event types without a client presentation, so a stock alert showed as
 * "Taken". This guards the whole vocabulary: a new server event with no presentation
 * fails `pnpm test`.
 */
describe('notification event presentations', () => {
  it('presents every server event with a label, icon and tone', () => {
    expect(Object.keys(notificationPresentation).sort()).toEqual(
      [...notificationEventTypeSchema.options].sort(),
    );

    for (const event of notificationEventTypeSchema.options) {
      const presentation = notificationPresentation[event];
      expect(presentation.label.trim().length, `missing label for "${event}"`).toBeGreaterThan(0);
      expect(presentation.icon.trim().length, `missing icon for "${event}"`).toBeGreaterThan(0);
      expect(
        statusToneSchema.safeParse(presentation.tone).success,
        `unknown tone for "${event}"`,
      ).toBe(true);
    }
  });
});
