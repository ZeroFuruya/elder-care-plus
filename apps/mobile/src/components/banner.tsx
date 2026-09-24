import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, lineHeight, radius, spacing } from '@/constants/theme';

export type BannerTone = 'success' | 'error' | 'info';

const TONE_COLOR = {
  success: colors.success,
  error: colors.danger,
  info: colors.textMuted,
} as const;

const TONE_GLYPH = {
  success: '\u2713',
  error: '!',
  info: 'i',
} as const;

const TONE_PREFIX = {
  success: 'Success',
  error: 'Error',
  info: 'Note',
} as const;

interface BannerProps {
  tone: BannerTone;
  message: string;
}

/** Inline feedback message. Never colour-only: each tone carries a glyph and a worded prefix. */
export function Banner({ tone, message }: BannerProps) {
  const color = TONE_COLOR[tone];

  return (
    <View
      accessibilityRole={tone === 'info' ? 'text' : 'alert'}
      accessibilityLabel={`${TONE_PREFIX[tone]}: ${message}`}
      style={[styles.container, { borderColor: color }]}
    >
      <Text style={[styles.glyph, { color }]}>{TONE_GLYPH[tone]}</Text>
      <Text style={[styles.message, { color }]}>
        <Text style={styles.prefix}>{TONE_PREFIX[tone]}: </Text>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  glyph: {
    fontSize: fontSize.body,
    fontWeight: '700',
    lineHeight: lineHeight.body,
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
