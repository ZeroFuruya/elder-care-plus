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
import { formatTime } from '@/lib/format';

/**
 * A time-of-day field backed by the platform's own picker, the clock twin of `DateField`.
 *
 * The value travels as the `HH:MM` the `time` column stores, so nothing downstream has to know
 * about the picker. Android gets the Material dialog; iOS has no modal presentation for this
 * control, so the inline picker is hosted in the standard in-app `ModalCard` - never a system
 * alert (checking requirement).
 */
export interface TimeFieldProps {
  label: string;
  /** `HH:MM` 24-hour, or `''` when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
}

/** Only the clock part is read back, so the date half of the draft is irrelevant. */
function draftFrom(value: string, fallbackHour: number): Date {
  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10));
  const date = new Date();
  date.setHours(
    Number.isFinite(hours) ? hours : fallbackHour,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  return date;
}

function toClock(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function TimeField({ label, value, onChange, placeholder, error }: TimeFieldProps) {
  const { scheme, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => draftFrom('', 8));

  const selected = value.length > 0 ? draftFrom(value, 8) : null;

  function show() {
    setDraft(draftFrom(value, 8));
    setOpen(true);
  }

  function commit(date: Date) {
    setOpen(false);
    onChange(toClock(date));
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label}: ${formatTime(selected)}` : label}
        accessibilityHint="Opens the time picker"
        accessibilityValue={selected ? { text: formatTime(selected) } : undefined}
        onPress={show}
        android_ripple={{ color: colors.border }}
        style={({ pressed }) => [
          styles.row,
          error ? styles.rowError : null,
          pressed ? styles.rowPressed : null,
        ]}
      >
        <Icon name="clock" size={20} color={colors.textMuted} />
        <Text style={selected ? styles.value : styles.placeholder}>
          {selected ? formatTime(selected) : placeholder}
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
          mode="time"
          accentColor={colors.primary}
          onValueChange={(_event, date) => commit(date)}
          onDismiss={() => setOpen(false)}
        />
      ) : null}

      {open && Platform.OS === 'ios' ? (
        <ModalCard visible title={label} onRequestClose={() => setOpen(false)}>
          <DateTimePicker
            value={draft}
            mode="time"
            display="spinner"
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
