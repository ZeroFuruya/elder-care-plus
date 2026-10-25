import { z } from 'zod';

/**
 * Prescription-photo contracts (sprint 10, "photo storage only").
 *
 * The owner cut the Sprint 6 AI/OCR pipeline, then re-added **photo storage with no OCR**
 * (2026-10-25): a caregiver attaches a photo of a paper prescription to a medicine, and the care
 * circle can look at it read-only. Nothing here reads, interprets or auto-fills a medicine — the
 * image is only ever shown to a human.
 *
 * These constants mirror
 * `supabase/migrations/20261110120000_sprint10_medication_images.sql` (the bucket name, the size
 * ceiling and the mime allowlist) so the client refuses the same uploads the storage policy and
 * the guarded RPC would, and the two cannot drift silently.
 */

/** The private Supabase Storage bucket. Never public; reads go through short-lived signed URLs. */
export const MEDICATION_IMAGE_BUCKET = 'prescription-images';

/** Matches the bucket's `file_size_limit` and the RPC's size check. 10 MiB. */
export const MAX_MEDICATION_IMAGE_BYTES = 10 * 1024 * 1024;

/** Matches the bucket's `allowed_mime_types` and the `mime_type` column check. */
export const medicationImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MedicationImageMimeType = (typeof medicationImageMimeTypes)[number];

export const medicationImageMimeSchema = z.enum(medicationImageMimeTypes);

export function isMedicationImageMimeType(value: string): value is MedicationImageMimeType {
  return (medicationImageMimeTypes as readonly string[]).includes(value);
}

/**
 * The fields `register_medication_image` accepts. The manifest the client already knows (path,
 * mime, size) travels with the call so the row is written once, after the bytes are in the
 * bucket.
 */
export const medicationImageInputSchema = z.object({
  medicationId: z.string().trim().min(1),
  storagePath: z
    .string()
    .trim()
    .min(1)
    // `<medication_id>/<uuid>.<ext>` — the shape the storage policy parses.
    .regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/),
  mimeType: medicationImageMimeSchema,
  sizeBytes: z.number().int().positive().max(MAX_MEDICATION_IMAGE_BYTES),
});
export type MedicationImageInput = z.infer<typeof medicationImageInputSchema>;

/** The file extension for a stored mime type. The path always carries one. */
export function medicationImageExtension(mime: MedicationImageMimeType): 'jpg' | 'png' | 'webp' {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

/**
 * The mime type to store for a picked asset.
 *
 * `expo-image-picker` reports a mime type on most devices but not all, and occasionally reports
 * the non-standard `image/jpg`. Anything outside the allowlist (including a missing value) is
 * resolved from the file extension, defaulting to JPEG because that is what the picker produces
 * by default.
 */
export function resolveMedicationImageMimeType(
  reportedMimeType: string | null | undefined,
  uri: string,
): MedicationImageMimeType {
  const reported = (reportedMimeType ?? '').trim().toLowerCase();
  const normalized = reported === 'image/jpg' ? 'image/jpeg' : reported;
  if (isMedicationImageMimeType(normalized)) return normalized;

  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** The storage object path for a new photo: `<medication_id>/<file>.<ext>`. */
export function medicationImageStoragePath(
  medicationId: string,
  fileId: string,
  mime: MedicationImageMimeType,
): string {
  return `${medicationId}/${fileId}.${medicationImageExtension(mime)}`;
}
