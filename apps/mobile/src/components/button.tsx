import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

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
        variantStyles[variant],
        size === 'large' ? styles.large : styles.default,
        inactive ? styles.inactive : null,
        pressed && !inactive ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={spinnerColor} /> : null}
      <Text style={[styles.label, labelStyles[variant]]}>{loading ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});

const variantStyles = StyleSheet.create({
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

const labelStyles = StyleSheet.create({
  primary: { color: colors.onPrimaryFill },
  secondary: { color: colors.primary },
  danger: { color: colors.surface },
  ghost: { color: colors.primary },
});
