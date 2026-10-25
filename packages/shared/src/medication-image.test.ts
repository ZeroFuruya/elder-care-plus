import { describe, expect, it } from 'vitest';

import {
  MAX_MEDICATION_IMAGE_BYTES,
  medicationImageExtension,
  medicationImageInputSchema,
  medicationImageStoragePath,
  resolveMedicationImageMimeType,
} from './medication-image';

const MEDICATION_ID = '11111111-1111-1111-1111-111111111111';

describe('resolveMedicationImageMimeType', () => {
  it('keeps an allowlisted mime type', () => {
    expect(resolveMedicationImageMimeType('image/png', 'file://a.png')).toBe('image/png');
    expect(resolveMedicationImageMimeType('image/webp', 'file://a.webp')).toBe('image/webp');
  });

  it('normalizes the non-standard image/jpg', () => {
    expect(resolveMedicationImageMimeType('image/jpg', 'file://a.jpg')).toBe('image/jpeg');
  });

  it('falls back to the file extension when the reported type is missing or unknown', () => {
    expect(resolveMedicationImageMimeType(null, 'file://photo.PNG')).toBe('image/png');
    expect(resolveMedicationImageMimeType('application/octet-stream', 'file://x.webp')).toBe(
      'image/webp',
    );
  });

  it('defaults to JPEG', () => {
    expect(resolveMedicationImageMimeType(undefined, 'file://no-extension')).toBe('image/jpeg');
  });
});

describe('medicationImageExtension and medicationImageStoragePath', () => {
  it('maps a mime type to its extension', () => {
    expect(medicationImageExtension('image/jpeg')).toBe('jpg');
    expect(medicationImageExtension('image/png')).toBe('png');
    expect(medicationImageExtension('image/webp')).toBe('webp');
  });

  it('builds the <medication_id>/<file>.<ext> path the storage policy parses', () => {
    expect(medicationImageStoragePath(MEDICATION_ID, 'abc123', 'image/png')).toBe(
      `${MEDICATION_ID}/abc123.png`,
    );
  });
});

describe('medicationImageInputSchema', () => {
  const valid = {
    medicationId: MEDICATION_ID,
    storagePath: `${MEDICATION_ID}/abc123.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
  };

  it('accepts a well-formed registration', () => {
    expect(medicationImageInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a path that is not the medication folder', () => {
    expect(
      medicationImageInputSchema.safeParse({ ...valid, storagePath: 'elsewhere/abc123.jpg' })
        .success,
    ).toBe(false);
  });

  it('rejects an unsupported mime type', () => {
    expect(medicationImageInputSchema.safeParse({ ...valid, mimeType: 'image/gif' }).success).toBe(
      false,
    );
  });

  it('rejects an oversized file', () => {
    expect(
      medicationImageInputSchema.safeParse({ ...valid, sizeBytes: MAX_MEDICATION_IMAGE_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it('rejects a zero-byte file', () => {
    expect(medicationImageInputSchema.safeParse({ ...valid, sizeBytes: 0 }).success).toBe(false);
  });
});
