import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  type AppElevation,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface CardProps {
  title?: string;
  children: ReactNode;
}

/**
 * A raised surface.
 *
 * Soft-UI technique: the card floats over the tinted field on a soft diffuse shadow instead of
 * being outlined. The hairline border stays as a fallback in case a platform does not render
 * `boxShadow`; it is decorative, and `docs/02-ui-ux-standard.md` §5 only forbids `border` from
 * being the *sole* boundary of a **control**, which a card is not.
 */
export function Card({ title, children }: CardProps) {
  const { colors, elevation } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, elevation), [colors, elevation]);

  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      boxShadow: elevation.card,
      gap: spacing.sm,
      padding: spacing.md,
    },
    title: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
      textTransform: 'uppercase',
    },
  });
}
