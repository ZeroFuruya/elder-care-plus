import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import {
  fontSize,
  lineHeight,
  modalSurface,
  spacing,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface ModalCardProps {
  visible: boolean;
  title: string;
  /** Optional: a picker dialog explains itself through its own control. */
  description?: string;
  onRequestClose: () => void;
  children: ReactNode;
}

/**
 * In-app dialog frame. The instructor's checking requires that no message is a
 * browser/system alert, so every confirmation and password prompt renders here.
 */
export function ModalCard({
  visible,
  title,
  description,
  onRequestClose,
  children,
}: ModalCardProps) {
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.panel} accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    panel: {
      ...modalSurface(colors, elevation, gradients),
      gap: spacing.md,
      maxWidth: 480,
      padding: spacing.lg,
      width: '100%',
    },
    title: {
      color: colors.text,
      fontSize: fontSize.heading,
      fontWeight: '700',
      lineHeight: lineHeight.heading,
    },
    description: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
  });
}
