import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ModalCard } from '@/components/modal-card';
import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  touchTarget,
  type AppThemeColors,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateWithYear, parseDayOnly, toIsoDay } from '@/lib/format';

/**
 * A date field backed by the platform's own date picker.
 *
 * The approved wireframe drew `Birth date` as a text box hinting `YYYY-MM-DD`, but a typed format
 * is a data-entry trap for the caregiver and the owner asked for the real control ("do the proper
 * date picker"). The value still travels as the `YYYY-MM-DD` the `date` columns store, so the write
 * path is unchanged.
 *
 * Android shows the Material 3 dialog, whose confirm/dismiss wording is the system's own. iOS has no
 * modal presentation for this control, so the inline picker is hosted in the standard in-app
 * `ModalCard` — never a system alert (checking requirement).
 */
export interface DateFieldProps {
  label: string;
  /** `YYYY-MM-DD`, or `''` when the field is unset. */
  value: string;
  onChange: (value: string) => void;
  /** Shown in place of a date before one is chosen. */
  placeholder: string;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder,
  error,
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const { scheme, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => new Date());

  const selected = value.length > 0 ? parseDayOnly(value) : null;

  function show() {
    setDraft(selected ?? maximumDate ?? new Date());
    setOpen(true);
  }

  function commit(date: Date) {
    setOpen(false);
    onChange(toIsoDay(date));
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label}: ${formatDateWithYear(selected)}` : label}
        accessibilityHint="Opens the date picker"
        accessibilityValue={selected ? { text: formatDateWithYear(selected) } : undefined}
        onPress={show}
        android_ripple={{ color: colors.border }}
        style={({ pressed }) => [
          styles.row,
          error ? styles.rowError : null,
          pressed ? styles.rowPressed : null,
        ]}
      >
        <Icon name="calendar" size={20} color={colors.textMuted} />
        <Text style={selected ? styles.value : styles.placeholder}>
          {selected ? formatDateWithYear(selected) : placeholder}
        </Text>
        <Icon name="expand" size={20} color={colors.textMuted} />
      </Pressable>

      {error ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <Icon name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {open && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={draft}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          accentColor={colors.primary}
          onValueChange={(_event, date) => commit(date)}
          onDismiss={() => setOpen(false)}
        />
      ) : null}

      {open && Platform.OS === 'ios' ? (
        <ModalCard visible title={label} onRequestClose={() => setOpen(false)}>
          <DateTimePicker
            value={draft}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            accentColor={colors.primary}
            themeVariant={scheme}
            onValueChange={(_event, date) => setDraft(date)}
          />
          <Button label="Done" onPress={() => commit(draft)} />
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </ModalCard>
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
    row: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: touchTarget.min,
      paddingHorizontal: spacing.md,
    },
    rowPressed: {
      opacity: 0.85,
    },
    rowError: {
      borderColor: colors.danger,
      borderWidth: 2,
    },
    value: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    placeholder: {
      color: colors.textMuted,
      flex: 1,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    errorRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    errorText: {
      color: colors.danger,
      flex: 1,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
