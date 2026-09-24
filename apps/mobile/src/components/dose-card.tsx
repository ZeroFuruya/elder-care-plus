import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { StatusBadge } from '@/components/status-badge';
import { colors, fontSize, lineHeight, radius, spacing } from '@/constants/theme';
import type { DoseView } from '@/db';
import { formatTime } from '@/lib/format';

interface DoseCardProps {
  dose: DoseView;
  onMarkTaken?: () => void;
  marking?: boolean;
}

export function DoseCard({ dose, onMarkTaken, marking = false }: DoseCardProps) {
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
        <Text style={styles.metaGlyph}>{'\u25F7'}</Text>
        <Text style={styles.meta}>Scheduled for {formatTime(dose.scheduledAt)}</Text>
      </View>

      {dose.takenAt ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metaGlyph, styles.successGlyph]}>{'\u2713'}</Text>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
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
  metaGlyph: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  successGlyph: {
    color: colors.success,
  },
  successText: {
    color: colors.success,
    fontWeight: '600',
  },
});
