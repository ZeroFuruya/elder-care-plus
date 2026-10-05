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
