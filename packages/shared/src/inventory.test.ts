import { describe, expect, it } from 'vitest';

import {
  inventoryAdjustmentLabel,
  inventoryReasonLabels,
  stockAdjustmentReasonLabels,
} from './index';

/**
 * Sprint 9 shares the Sprint 5 stock vocabulary with the activity timeline
 * (docs/specs/sprint-9.md OD6), so the editor and the history never diverge.
 */

describe('inventoryAdjustmentLabel', () => {
  it('labels an automatic dose decrement', () => {
    expect(inventoryAdjustmentLabel('dose_confirmed', null)).toBe('Dose taken from stock');
  });

  it('labels each manual adjustment reason', () => {
    expect(inventoryAdjustmentLabel('manual_adjustment', 'restock')).toBe('Restock');
    expect(inventoryAdjustmentLabel('manual_adjustment', 'count_adjustment')).toBe('Count check');
  });

  it('falls back to the generic reason when a manual reason is missing', () => {
    expect(inventoryAdjustmentLabel('manual_adjustment', null)).toBe('Manual adjustment');
  });

  it('covers every declared reason', () => {
    for (const label of Object.values(inventoryReasonLabels)) {
      expect(label.length).toBeGreaterThan(0);
    }
    for (const label of Object.values(stockAdjustmentReasonLabels)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
