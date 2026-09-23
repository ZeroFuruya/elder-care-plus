import { z } from 'zod';

export const prescriptionStatusSchema = z.enum(['draft', 'verified', 'expired', 'archived']);
export type PrescriptionStatus = z.infer<typeof prescriptionStatusSchema>;

export const prescriptionStatusLabels: Record<PrescriptionStatus, string> = {
  draft: 'Draft',
  verified: 'Verified',
  expired: 'Expired',
  archived: 'Archived',
};

/**
 * An elder-submitted photo stays `pending_review` until the caregiver verifies it,
 * and is never treated as verified data anywhere else in the app.
 */
export const evidenceReviewStatusSchema = z.enum(['pending_review', 'verified', 'rejected']);
export type EvidenceReviewStatus = z.infer<typeof evidenceReviewStatusSchema>;

export const evidenceReviewStatusLabels: Record<EvidenceReviewStatus, string> = {
  pending_review: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
};
