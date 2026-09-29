import type { StatusPresentation } from '@eldercare/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { fontSize, lineHeight, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * Any shared status presentation (dose, stock, appointment) as icon + label + tone colour.
 *
 * `StatusBadge` does the same for dose status specifically; this one takes the presentation object
 * so the medication screens can render the stock state without a second copy of the recipe. The
 * label is always rendered, so status is never conveyed by colour alone
 * (docs/02-ui-ux-standard.md section 6).
 */
export function StatusPill({ presentation }: { presentation: StatusPresentation }) {
  const { statusColors } = useAppTheme();
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
    alignSelf: 'flex-start',
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
