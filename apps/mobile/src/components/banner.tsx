import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type AppIconName } from '@/components/icon';
import { fontSize, lineHeight, radius, spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type BannerTone = 'success' | 'error' | 'info';

const TONE_ICON: Record<BannerTone, AppIconName> = {
  success: 'check',
  error: 'alert-circle',
  info: 'info',
};

const TONE_PREFIX = {
  success: 'Success',
  error: 'Error',
  info: 'Note',
} as const;

function toneColor(tone: BannerTone, colors: AppThemeColors): string {
  if (tone === 'success') return colors.success;
  if (tone === 'error') return colors.danger;
  return colors.textMuted;
}

interface BannerProps {
  tone: BannerTone;
  message: string;
}

/** Inline feedback message. Never colour-only: each tone carries an icon and a worded prefix. */
export function Banner({ tone, message }: BannerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = toneColor(tone, colors);

  return (
    <View
      accessibilityRole={tone === 'info' ? 'text' : 'alert'}
      accessibilityLabel={`${TONE_PREFIX[tone]}: ${message}`}
      style={[styles.container, { borderColor: color }]}
    >
      <Icon name={TONE_ICON[tone]} size={18} color={color} />
      <Text style={[styles.message, { color }]}>
        <Text style={styles.prefix}>{TONE_PREFIX[tone]}: </Text>
        {message}
      </Text>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
    },
    message: {
      flex: 1,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    prefix: {
      fontWeight: '700',
    },
  });
}
