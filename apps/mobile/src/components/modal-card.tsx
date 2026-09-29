import type { ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, lineHeight, radius, spacing } from '@/constants/theme';

interface ModalCardProps {
  visible: boolean;
  title: string;
  description: string;
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.panel} accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
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
