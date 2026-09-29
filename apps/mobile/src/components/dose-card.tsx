import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { StatusBadge } from '@/components/status-badge';
import {
  cardSurface,
  fontSize,
  lineHeight,
  spacing,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';
import type { DoseView } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatTime } from '@/lib/format';

interface DoseCardProps {
  dose: DoseView;
  onMarkTaken?: () => void;
  marking?: boolean;
}

export function DoseCard({ dose, onMarkTaken, marking = false }: DoseCardProps) {
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={styles.medicine}>
            {dose.medicine} {dose.strength}
          </Text>
          <Text style={styles.instructions}>{dose.instructions}</Text>
        </View>
        <StatusBadge status={dose.status} />
      </View>

      <View style={styles.metaRow}>
        <Icon name="clock" size={14} color={colors.textMuted} />
        <Text style={styles.meta}>Scheduled for {formatTime(dose.scheduledAt)}</Text>
      </View>

      {dose.takenAt ? (
        <View style={styles.metaRow}>
          <Icon name="check" size={14} color={colors.success} />
          <Text style={[styles.meta, styles.successText]}>Taken at {formatTime(dose.takenAt)}</Text>
        </View>
      ) : null}

      {onMarkTaken ? (
        <Button
          label="Mark as taken"
          size="large"
          loading={marking}
          onPress={onMarkTaken}
          accessibilityLabel={`Mark ${dose.medicine} ${dose.strength} as taken`}
          accessibilityHint="Records the confirmation time and shares it with the family caregiver"
        />
      ) : null}
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
    top: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    info: {
      flex: 1,
      gap: spacing.xs,
    },
    medicine: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    instructions: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    metaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    successText: {
      color: colors.success,
      fontWeight: '600',
    },
  });
}
