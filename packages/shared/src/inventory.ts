import { z } from 'zod';

/**
 * Derived from the active batch's quantity and expiry date.
 * `needs_review` means no valid active batch remains: reminders are suppressed and
 * both users see a non-clinical "contact your caregiver" instruction.
 */
export const stockStatusSchema = z.enum([
  'normal',
  'low',
  'out',
  'expiring',
  'expired',
  'needs_review',
]);
export type StockStatus = z.infer<typeof stockStatusSchema>;

export const stockStatusLabels: Record<StockStatus, string> = {
  normal: 'Normal stock',
  low: 'Low stock',
  out: 'Out of stock',
  expiring: 'Expiring soon',
  expired: 'Expired',
  needs_review: 'Needs caregiver review',
};

/**
 * A medicine with no batch at all is not "normal stock": a batch is optional for
 * a plan (docs/00-product-flow.md Flow B), so the badge must not imply stock the
 * app is not tracking. Owner decision 2026-10-05.
 */
export const stockTrackingSchema = z.enum(['untracked']);
export type StockTracking = z.infer<typeof stockTrackingSchema>;

export const stockTrackingLabels: Record<StockTracking, string> = {
  untracked: 'No stock tracking',
};

/** What a stock badge can show: a real `StockStatus`, or "not tracked". */
export type StockDisplay = StockStatus | StockTracking;

/**
 * Expiry warning windows in days before expiry, widest first. Owner decision
 * 2026-10-05: the fixed default set (a per-elder settings UI is deferred). The
 * database sweep in `20261022120000_sprint5_inventory_expiry.sql` uses the same
 * boundaries by hand.
 */
export const expiryWarningWindows = [30, 14, 7, 1] as const;

/**
 * The narrowest warning window a remaining-days value has crossed, or `null`
 * when it is outside every window (or already expired). Injectable and pure so
 * the boundary is testable without a clock.
 */
export function expiryWindow(daysRemaining: number): number | null {
  if (!Number.isFinite(daysRemaining) || daysRemaining < 0) return null;
  const ascending = [...expiryWarningWindows].sort((a, b) => a - b);
  for (const window of ascending) {
    if (daysRemaining <= window) return window;
  }
  return null;
}

/**
 * Owner decision 2026-10-05: suppress reminders **only** when a batch exists but
 * no valid active batch remains. A medicine with no batch keeps reminding, and
 * quantity 0 only warns. This is deliberately separate from the display status:
 * generation must never infer suppression from what the badge shows.
 */
export function medicineSuppressesDoses(input: {
  hasAnyBatch: boolean;
  hasValidActiveBatch: boolean;
}): boolean {
  return input.hasAnyBatch && !input.hasValidActiveBatch;
}

/**
 * The two ledger reasons an `inventory_transactions` row can carry
 * (`docs/specs/sprint-5.md`). One vocabulary shared by the stock editor and the
 * Sprint 9 activity timeline, so the two can never disagree.
 */
export const inventoryReasonSchema = z.enum(['dose_confirmed', 'manual_adjustment']);
export type InventoryReason = z.infer<typeof inventoryReasonSchema>;

export const inventoryReasonLabels: Record<InventoryReason, string> = {
  dose_confirmed: 'Dose taken from stock',
  manual_adjustment: 'Manual adjustment',
};

/** The owner-approved manual adjustment reasons. */
export const stockAdjustmentReasons = [
  'restock',
  'correction',
  'damage',
  'waste',
  'count_adjustment',
] as const;

export const stockAdjustmentReasonSchema = z.enum(stockAdjustmentReasons);
export type StockAdjustmentReason = z.infer<typeof stockAdjustmentReasonSchema>;

/**
 * Display wording for the adjustment reasons. The stored value stays the machine
 * code; only the label is shown.
 */
export const stockAdjustmentReasonLabels: Record<StockAdjustmentReason, string> = {
  restock: 'Restock',
  correction: 'Correction',
  damage: 'Damaged',
  waste: 'Wasted',
  count_adjustment: 'Count check',
};

/**
 * The label for one ledger row: the specific manual reason when there is one, the
 * automatic decrement wording otherwise. A manual row always carries an
 * `adjustment_reason` (`inventory_transactions_adjustment_reason_required`), but a
 * defensive fallback covers a payload gap rather than rendering nothing.
 */
export function inventoryAdjustmentLabel(
  reason: InventoryReason,
  adjustmentReason: StockAdjustmentReason | null,
): string {
  if (reason === 'manual_adjustment' && adjustmentReason !== null) {
    return stockAdjustmentReasonLabels[adjustmentReason];
  }
  return inventoryReasonLabels[reason];
}
