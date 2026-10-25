import {
  base64ToBytes,
  MAX_MEDICATION_IMAGE_BYTES,
  resolveMedicationImageMimeType,
} from '@eldercare/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ModalCard } from '@/components/modal-card';
import { fontSize, lineHeight, radius, spacing, type AppThemeColors } from '@/constants/theme';
import {
  archiveMedicationImage,
  getMedicationImageUrl,
  listMedicationImages,
  uploadMedicationImage,
  type MedicationImage,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * Prescription photos for one medicine (sprint 10). Photo storage only — the image is never
 * read or interpreted, and it never fills another field.
 *
 * The caregiver gets the full card (`Add prescription photo`, a thumbnail per photo, and a
 * soft `Remove`). The elder and family get the same thumbnails read-only, with no add or remove
 * affordance; `compact` drops the card chrome and the empty state so a list screen stays clean.
 *
 * Every photo is fetched as a short-lived signed URL: the bucket is private and never public, so
 * a plain URL cannot be guessed or shared.
 */

interface PrescriptionPhotosProps {
  medicationId: string;
  /** Read-only for the elder and family: no add or remove. */
  readOnly?: boolean;
  /** Renders nothing when there are no photos and no card chrome (for list screens). */
  compact?: boolean;
}

interface PhotoItem {
  image: MedicationImage;
  url: string | null;
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // `base64` lets the upload avoid a file-system dependency: the picker hands back the bytes.
  base64: true,
  quality: 0.7,
  allowsEditing: false,
  exif: false,
};

const TOO_LARGE = 'That photo is too large. Choose one under 10 MB.';
const PERMISSION_DENIED =
  'Permission is needed to add a photo. You can allow it in your device settings.';

export function PrescriptionPhotos({
  medicationId,
  readOnly = false,
  compact = false,
}: PrescriptionPhotosProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [viewing, setViewing] = useState<PhotoItem | null>(null);
  const [removing, setRemoving] = useState<PhotoItem | null>(null);

  const loader = useCallback(async (): Promise<PhotoItem[]> => {
    const rows = await listMedicationImages(medicationId);
    return Promise.all(
      rows.map(async (image) => ({ image, url: await getMedicationImageUrl(image.storagePath) })),
    );
  }, [medicationId]);

  const { state, reload } = useAsyncData(loader);

  async function pick(source: 'camera' | 'library') {
    setChoosing(false);
    setFeedback(null);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFeedback(PERMISSION_DENIED);
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64) {
      setFeedback('That photo could not be read. Please try another.');
      return;
    }

    const mimeType = resolveMedicationImageMimeType(asset.mimeType, asset.uri);
    const bytes = base64ToBytes(asset.base64);
    if (bytes.byteLength > MAX_MEDICATION_IMAGE_BYTES) {
      setFeedback(TOO_LARGE);
      return;
    }

    setBusy(true);
    try {
      await uploadMedicationImage(medicationId, bytes, mimeType);
      await reload();
    } catch (cause: unknown) {
      setFeedback(cause instanceof Error ? cause.message : 'Could not add the photo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: PhotoItem) {
    setBusy(true);
    setFeedback(null);
    try {
      await archiveMedicationImage(item.image.id);
      await reload();
    } catch (cause: unknown) {
      setFeedback(cause instanceof Error ? cause.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  const items = state.status === 'ready' ? state.data : [];

  // Inline (list) mode draws nothing until there is a photo to show.
  if (compact && state.status !== 'error' && items.length === 0) {
    return null;
  }

  const thumbnails = items.map((item) => (
    <View key={item.image.id} style={styles.thumbWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View prescription photo"
        onPress={() => setViewing(item)}
        android_ripple={{ color: colors.border }}
        style={({ pressed }) => [styles.thumbButton, pressed ? styles.pressed : null]}
      >
        {item.url ? (
          <Image
            source={{ uri: item.url }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.meta}>Not available</Text>
          </View>
        )}
      </Pressable>
      {!readOnly ? (
        <Button label="Remove" variant="ghost" onPress={() => setRemoving(item)} disabled={busy} />
      ) : null}
    </View>
  ));

  const dialogs = (
    <>
      <ModalCard
        visible={choosing}
        title="Add prescription photo"
        description="Take a new photo or choose one already on your device."
        onRequestClose={() => setChoosing(false)}
      >
        <Button label="Take photo" onPress={() => void pick('camera')} />
        <Button
          label="Choose from library"
          variant="secondary"
          onPress={() => void pick('library')}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setChoosing(false)} />
      </ModalCard>

      <ModalCard
        visible={viewing !== null}
        title="Prescription photo"
        onRequestClose={() => setViewing(null)}
      >
        {viewing?.url ? (
          <Image
            source={{ uri: viewing.url }}
            style={styles.viewer}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.meta}>This photo could not be shown.</Text>
        )}
        <Button label="Close" variant="secondary" onPress={() => setViewing(null)} />
      </ModalCard>

      {removing ? (
        <ConfirmDialog
          visible
          title="Remove prescription photo"
          description="It is hidden from the care circle. The record is kept for the medicine's history."
          confirmLabel="Remove photo"
          danger
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      ) : null}
    </>
  );

  if (compact) {
    return (
      <View style={styles.compactWrap}>
        {feedback ? <Banner tone="error" message={feedback} /> : null}
        <View style={styles.grid}>{thumbnails}</View>
        {dialogs}
      </View>
    );
  }

  return (
    <Card title="Prescription photos">
      {feedback ? <Banner tone="error" message={feedback} /> : null}

      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} />
      ) : state.status === 'error' ? (
        <Banner tone="error" message={state.message} />
      ) : items.length === 0 ? (
        <Text style={styles.meta}>
          {readOnly
            ? 'No prescription photos have been added for this medicine.'
            : 'No prescription photos yet.'}
        </Text>
      ) : (
        <View style={styles.grid}>{thumbnails}</View>
      )}

      {!readOnly ? (
        <Button
          label="Add prescription photo"
          variant="secondary"
          onPress={() => setChoosing(true)}
          disabled={busy}
        />
      ) : null}

      <Text style={styles.meta}>
        {readOnly
          ? 'Read-only. Prescription photos are added by the caregiver.'
          : 'Photos are stored privately and shown only to the care circle. They are never read automatically.'}
      </Text>

      {dialogs}
    </Card>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    compactWrap: {
      gap: spacing.sm,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    thumbWrap: {
      gap: spacing.xs,
      width: 132,
    },
    thumbButton: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    pressed: {
      opacity: 0.85,
    },
    thumb: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      height: 132,
      width: 132,
    },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.sm,
    },
    viewer: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      height: 320,
      width: '100%',
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
