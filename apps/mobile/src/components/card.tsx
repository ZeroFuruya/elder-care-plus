import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  cardSurface,
  fontSize,
  lineHeight,
  spacing,
  type AppElevation,
  type AppGradients,
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
 * The recipe itself lives in `cardSurface` (`constants/theme.ts`) so every raised surface in the
 * app is the same one; this component adds the titled-section layout on top. Soft-UI technique:
 * a whisper-soft gradient fill under a two-shadow elevation pair, taken from
 * `docs/references/figma-soft-ui.md`. The card therefore carries **no border** — the reference has
 * none, and our `border` token is 1.12:1 on the background, so it was never what made a card
 * legible.
 */
export function Card({ title, children }: CardProps) {
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, elevation, gradients),
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
