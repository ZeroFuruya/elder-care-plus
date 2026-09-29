import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  touchTarget,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface FieldProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'style'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  /** Renders the Show/Hide password control. */
  isPassword?: boolean;
}

export function Field({
  label,
  value,
  onChangeText,
  error,
  isPassword,
  multiline,
  ...rest
}: FieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.inputRow,
          multiline ? styles.inputRowMultiline : null,
          error ? styles.inputRowError : null,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
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

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
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
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      minHeight: touchTarget.min,
      paddingLeft: spacing.md,
    },
    inputRowMultiline: {
      alignItems: 'flex-start',
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
    inputMultiline: {
      minHeight: touchTarget.min * 2,
      paddingTop: spacing.sm,
      textAlignVertical: 'top',
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
}
