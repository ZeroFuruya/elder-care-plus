import { StyleSheet, View, type ColorValue } from 'react-native';

import { Icon, type AppIconName } from '@/components/icon';
import { radius } from '@/constants/theme';

interface TabIconProps {
  name: AppIconName;
  color: ColorValue;
  focused: boolean;
}

/**
 * Bottom-navigation icon with the soft-UI active marker (technique reference: the Figma
 * "Soft UI Design - Neumorphism" community cover, owner-approved 2026-09-30).
 *
 * The marker is an **extra** cue, never the only one: the active tab is already carried by the
 * tint, the label and the tab's `accessibilityState`, which is what
 * `docs/02-ui-ux-standard.md` §6 requires. It is absolutely positioned so it adds no layout
 * height to the tab bar.
 */
export function TabIcon({ name, color, focused }: TabIconProps) {
  return (
    <View style={styles.box}>
      <Icon name={name} size={24} color={color} />
      {focused ? <View style={[styles.indicator, { backgroundColor: color }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  indicator: {
    borderRadius: radius.pill,
    bottom: -3,
    height: 3,
    position: 'absolute',
    width: 16,
  },
});
