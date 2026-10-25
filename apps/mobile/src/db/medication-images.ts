import {
  MEDICATION_IMAGE_BUCKET,
  medicationImageStoragePath,
  type MedicationImageMimeType,
} from '@eldercare/shared';
import * as Crypto from 'expo-crypto';

import { getSupabase } from '@/supabase/client';

import { medicationWriteError } from './medications';

/**
 * Prescription-photo access (sprint 10).
 *
 * The bytes live in a private Storage bucket; this module is the whole client surface for them.
 * Reads are RLS-scoped selects. An upload is two steps the caller coordinates: put the bytes in
 * the bucket (guarded by a Storage policy), then register the row through a guarded RPC. The
 * client never inserts into `medication_images` directly.
 *
 * A view is a short-lived signed URL, minted per render and never stored.
 */

const IMAGE_COLUMNS =
  'id, medication_id, storage_path, mime_type, size_bytes, uploaded_by, created_at, is_archived, archived_at' as const;

/** How long a viewing URL stays valid. Short on purpose: it is a bearer token for the image. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface MedicationImageRow {
  id: string;
  medication_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | string;
  uploaded_by: string;
  created_at: string;
  is_archived: boolean;
  archived_at: string | null;
}

export interface MedicationImage {
  id: string;
  medicationId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  isArchived: boolean;
  archivedAt: string | null;
}

function toImage(row: MedicationImageRow): MedicationImage {
  return {
    id: row.id,
    medicationId: row.medication_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    isArchived: row.is_archived,
    archivedAt: row.archived_at,
  };
}

/** The active (not archived) photos for a medicine, newest first. */
export async function listMedicationImages(medicationId: string): Promise<MedicationImage[]> {
  const { data, error } = await getSupabase()
    .from('medication_images')
    .select(IMAGE_COLUMNS)
    .eq('medication_id', medicationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .returns<MedicationImageRow[]>();

  if (error) throw new Error('Could not load the prescription photos.');
  return data.map(toImage);
}

/**
 * Uploads the bytes, then registers the row. Throws a user-safe message on failure.
 *
 * `bytes` is the decoded image. A `null` return in the middle (e.g. a bucket the policy refuses)
 * surfaces as an error, never a silent no-op.
 */
export async function uploadMedicationImage(
  medicationId: string,
  bytes: Uint8Array,
  mimeType: MedicationImageMimeType,
): Promise<void> {
  const supabase = getSupabase();
  const path = medicationImageStoragePath(medicationId, Crypto.randomUUID(), mimeType);

  const { error: uploadError } = await supabase.storage
    .from(MEDICATION_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });

  if (uploadError) {
    throw new Error('Could not upload the photo. Check your connection and try again.');
  }

  const { error } = await supabase.rpc('register_medication_image', {
    p_medication_id: medicationId,
    p_storage_path: path,
    p_mime_type: mimeType,
    p_size_bytes: bytes.byteLength,
  });

  if (error) throw medicationWriteError(error, 'Could not save the prescription photo.');
}

/**
 * Mints a short-lived viewing URL for one stored photo, or `null` when the object is missing or
 * the caller may not read it.
 */
export async function getMedicationImageUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from(MEDICATION_IMAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Soft-archives a photo. The stored object is kept (`docs/specs` — never hard-delete). */
export async function archiveMedicationImage(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('archive_medication_image', { p_id: id });

  if (error) throw medicationWriteError(error, 'Could not remove the prescription photo.');
}
