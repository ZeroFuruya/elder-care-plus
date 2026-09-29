import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  touchTarget,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T extends string> {
  /** Shown above the group, like a field label (docs/02-ui-ux-standard.md section 11). */
  label: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Single-choice chips for short fixed lists (blood type, emergency category). Every chip is a
 * 48 dp target, and the selected state carries a check glyph so it is never colour alone.
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChoiceChipsProps<T>) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              android_ripple={{ color: colors.border }}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : null,
                pressed ? styles.chipPressed : null,
              ]}
            >
              <View style={styles.chipContent}>
                {selected ? <Icon name="check" size={16} color={colors.onPrimaryFill} /> : null}
                <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                  {option.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
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
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: touchTarget.min,
      paddingHorizontal: spacing.md,
    },
    chipContent: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    chipSelected: {
      backgroundColor: colors.primaryFill,
      borderColor: colors.primaryFill,
    },
    chipPressed: {
      opacity: 0.85,
    },
    chipLabel: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    chipLabelSelected: {
      color: colors.onPrimaryFill,
      fontWeight: '600',
    },
  });
}
