import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface DetailRowProps {
  label: string;
  value: string | null | undefined;
}

/**
 * One labelled read-only value on the elder-profile read views (`C-10`, `E-07`).
 *
 * Renders nothing when the value is absent: an optional field that was never recorded stays
 * visibly empty instead of being filled with an invented "not recorded" string
 * (docs/specs/sprint-2.md, data-touched notes).
 */
export function DetailRow({ label, value }: DetailRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!value) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: {
      gap: spacing.xs,
    },
    label: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    value: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
  });
}
