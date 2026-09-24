import { doseStatusPresentation, type DoseStatus } from '@eldercare/shared';
import { StyleSheet, Text, View } from 'react-native';

import { fontSize, lineHeight, radius, spacing, statusColors } from '@/constants/theme';
import { statusGlyph } from '@/lib/status-glyph';

interface StatusBadgeProps {
  status: DoseStatus;
}

/**
 * Dose status as icon + label + tone colour. The label is always rendered, so the status is
 * never conveyed by colour alone (docs/02-ui-ux-standard.md section 6).
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const presentation = doseStatusPresentation[status];
  const color = statusColors[presentation.tone];

  return (
    <View
      accessibilityLabel={`Status: ${presentation.label}`}
      style={[styles.badge, { borderColor: color }]}
    >
      <Text style={[styles.glyph, { color }]}>{statusGlyph(presentation.icon)}</Text>
      <Text style={[styles.label, { color }]}>{presentation.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  glyph: {
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  label: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
});
