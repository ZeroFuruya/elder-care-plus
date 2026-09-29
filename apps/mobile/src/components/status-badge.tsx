import { doseStatusPresentation, type DoseStatus } from '@eldercare/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { fontSize, lineHeight, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface StatusBadgeProps {
  status: DoseStatus;
}

/**
 * Dose status as icon + label + tone colour. The label is always rendered, so the status is
 * never conveyed by colour alone (docs/02-ui-ux-standard.md section 6).
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { statusColors } = useAppTheme();
  const presentation = doseStatusPresentation[status];
  const color = statusColors[presentation.tone];

  return (
    <View
      accessibilityLabel={`Status: ${presentation.label}`}
      style={[styles.badge, { borderColor: color }]}
    >
      <Icon name={presentation.icon} size={14} color={color} />
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
  label: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
});
