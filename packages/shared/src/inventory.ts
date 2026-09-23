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
