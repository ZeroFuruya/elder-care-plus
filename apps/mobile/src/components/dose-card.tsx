import { doseStatusPresentation, syncStatePresentation } from '@eldercare/shared';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  /** When set the whole card opens the dose detail. */
  onPress?: () => void;
  onMarkTaken?: () => void;
  marking?: boolean;
}

/**
 * A dose occurrence: medicine, status and the times that matter.
 *
 * The status is always the shared `doseStatusPresentation` (icon + label + tone),
 * and a queued offline confirmation adds a `Pending sync` row, so neither is ever
 * conveyed by colour alone (docs/02-ui-ux-standard.md section 6).
 */
export function DoseCard({ dose, onPress, onMarkTaken, marking = false }: DoseCardProps) {
  const { colors, elevation, gradients, statusColors } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );
  const status = doseStatusPresentation[dose.status];
  const sync = syncStatePresentation[dose.syncState];

  const body = (
    <>
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

      {dose.missedAt ? (
        <View style={styles.metaRow}>
          <Icon name="alert-triangle" size={14} color={colors.danger} />
          <Text style={[styles.meta, styles.dangerText]}>
            Missed at {formatTime(dose.missedAt)}
          </Text>
        </View>
      ) : null}

      {dose.syncState === 'pending' ? (
        <View style={styles.metaRow} accessibilityLabel={`Sync: ${sync.label}`}>
          <Icon name={sync.icon} size={14} color={statusColors[sync.tone]} />
          <Text style={[styles.meta, { color: statusColors[sync.tone] }]}>
            {sync.label} · waiting to reach the server
          </Text>
        </View>
      ) : null}

      {onMarkTaken ? (
        <Button
          label="Mark as taken"
          size="large"
          loading={marking}
          onPress={onMarkTaken}
          accessibilityLabel={`Mark as taken, ${dose.medicine} ${dose.strength}, ${formatTime(dose.scheduledAt)}`}
          accessibilityHint="Records the confirmation time and shares it with the family caregiver"
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${dose.medicine} ${dose.strength}, status ${status.label}`}
      accessibilityHint="Opens the dose detail"
      onPress={onPress}
      android_ripple={{ color: colors.border }}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, elevation, gradients),
      gap: spacing.sm,
      padding: spacing.md,
    },
    pressed: {
      opacity: 0.85,
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
    dangerText: {
      color: colors.danger,
      fontWeight: '600',
    },
  });
}
