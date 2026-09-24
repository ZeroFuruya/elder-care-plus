import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fontSize, lineHeight, radius, spacing, touchTarget } from '@/constants/theme';

interface FieldProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'style'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  /** Renders the Show/Hide password control. */
  isPassword?: boolean;
}

export function Field({ label, value, onChangeText, error, isPassword, ...rest }: FieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !visible}
          {...rest}
        />

        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((current) => !current)}
            style={styles.toggle}
            hitSlop={4}
          >
            <Text style={styles.toggleText}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <Text style={styles.errorGlyph}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: touchTarget.min,
    paddingLeft: spacing.md,
  },
  inputRowError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.body,
    minHeight: touchTarget.min,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  toggle: {
    alignItems: 'center',
    height: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  toggleText: {
    color: colors.primary,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  errorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  errorGlyph: {
    color: colors.danger,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
