import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, lineHeight, spacing, touchTarget } from '@/constants/theme';

interface AppBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showBell?: boolean;
}

/** Top app bar: title, optional Back, one notification bell (docs/02-ui-ux-standard.md section 8). */
export function AppBar({ title, subtitle, showBack, showBell }: AppBarProps) {
  return (
    <View style={styles.bar}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.iconButton}
          hitSlop={8}
        >
          <Text style={styles.backGlyph}>{'\u2039'}</Text>
        </Pressable>
      ) : null}

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {showBell ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          accessibilityHint="Opens the notification list"
          style={styles.iconButton}
          hitSlop={8}
        >
          <Text style={styles.bellGlyph}>{'\u{1F514}'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    height: touchTarget.min,
    justifyContent: 'center',
    width: touchTarget.min,
  },
  backGlyph: {
    color: colors.text,
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
  },
  bellGlyph: {
    fontSize: fontSize.heading,
  },
  titles: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.heading,
    fontWeight: '700',
    lineHeight: lineHeight.heading,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
