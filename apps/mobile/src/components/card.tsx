import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  fontSize,
  lineHeight,
  radius,
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
 * Soft-UI technique, taken as the pair it is in the reference
 * (`docs/references/figma-soft-ui.md`): a whisper-soft gradient fill and a two-shadow elevation,
 * not a flat fill inside an outline. The card therefore carries **no border** — the template has
 * none, and our `border` token is 1.48:1 on the background, so it was never what made the card
 * legible. What makes it legible is the surface tint plus the shadow.
 *
 * The gradient is drawn with React Native's native `experimental_backgroundImage` (no gradient
 * dependency). `backgroundColor` stays underneath it as a flat fallback, so if a platform does not
 * render the gradient the card is exactly what it was before rather than broken.
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
      backgroundColor: colors.surface,
      borderCurve: 'continuous',
      borderRadius: radius.lg,
      boxShadow: elevation.card,
      // The structured form of `experimental_backgroundImage`, not a CSS string: no angle or
      // percentage text for the platform to parse, and the two stops come straight from the
      // `AppGradients` tokens the contrast gate checks.
      experimental_backgroundImage: [
        {
          colorStops: [
            { color: gradients.cardFrom, positions: ['0%'] },
            { color: gradients.cardTo, positions: ['100%'] },
          ],
          direction: 'to bottom',
          type: 'linear-gradient',
        },
      ],
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
