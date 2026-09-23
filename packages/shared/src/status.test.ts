import { describe, expect, it } from 'vitest';

import {
  appointmentStateLabels,
  appointmentStateSchema,
  appointmentTypeLabels,
  appointmentTypeSchema,
  doseStatusLabels,
  doseStatusSchema,
  evidenceReviewStatusLabels,
  evidenceReviewStatusSchema,
  prescriptionStatusLabels,
  prescriptionStatusSchema,
  stockStatusLabels,
  stockStatusSchema,
  syncStateLabels,
  syncStateSchema,
} from './index';

/**
 * Product hard rule: status is never conveyed by color alone. Every status enum
 * must therefore have a non-empty human-readable label. If someone adds a status
 * without a label, this fails.
 */
describe('status labels', () => {
  const cases = [
    ['dose status', doseStatusSchema.options, doseStatusLabels],
    ['sync state', syncStateSchema.options, syncStateLabels],
    ['stock status', stockStatusSchema.options, stockStatusLabels],
    ['appointment state', appointmentStateSchema.options, appointmentStateLabels],
    ['appointment type', appointmentTypeSchema.options, appointmentTypeLabels],
    ['prescription status', prescriptionStatusSchema.options, prescriptionStatusLabels],
    ['evidence review status', evidenceReviewStatusSchema.options, evidenceReviewStatusLabels],
  ] as const;

  it.each(cases)('%s has a text label for every value', (_name, options, labels) => {
    for (const option of options) {
      const label = (labels as Record<string, string | undefined>)[option];
      expect(label, `missing label for "${option}"`).toBeTruthy();
      expect(label?.trim().length).toBeGreaterThan(0);
    }
  });
});
