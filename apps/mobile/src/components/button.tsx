import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { fontSize, radius, spacing, touchTarget, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `large` is the 56 dp size reserved for the elder's `Mark as taken` action. */
  size?: 'default' | 'large';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inactive = disabled || loading;

  // The bright brand fill cannot carry white text (§5.2): the primary button is Teal with a
  // Navy label. The danger fill is dark enough to take white.
  const spinnerColor =
    variant === 'primary'
      ? colors.onPrimaryFill
      : variant === 'danger'
        ? colors.textInverse
        : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={{ color: colors.border }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === 'large' ? styles.large : styles.default,
        inactive ? styles.inactive : null,
        pressed && !inactive ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={spinnerColor} /> : null}
      <Text style={[styles.label, labelStyle(variant, colors)]}>
        {loading ? 'Please wait…' : label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    base: {
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    default: {
      minHeight: touchTarget.min,
    },
    large: {
      minHeight: touchTarget.primaryAction,
    },
    inactive: {
      opacity: 0.55,
    },
    pressed: {
      opacity: 0.85,
    },
    label: {
      fontSize: fontSize.body,
      fontWeight: '600',
    },
    primary: {
      backgroundColor: colors.primaryFill,
      borderColor: colors.primaryFill,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    danger: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
  });
}

/** Label colours are read outside the StyleSheet because they use the values, not the sheet. */
function labelStyle(variant: ButtonVariant, colors: AppThemeColors) {
  const map: Record<ButtonVariant, { color: string }> = {
    primary: { color: colors.onPrimaryFill },
    secondary: { color: colors.primary },
    danger: { color: colors.textInverse },
    ghost: { color: colors.primary },
  };
  return map[variant];
}
