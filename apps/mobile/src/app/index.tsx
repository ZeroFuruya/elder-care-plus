import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

/**
 * Role gate. Real logic (session + role from `profiles`, not client state)
 * lands in Sprint 1 (Flow A). For now this only exercises the route skeleton.
 */
export default function WelcomeScreen() {
  return (
    <ScreenScaffold
      title="ElderCare+"
      description="Care coordination and record-keeping for families. This build is a navigation skeleton."
    >
      <View style={styles.group}>
        <Text style={styles.groupLabel}>Account</Text>
        <Link href="/welcome" style={styles.link}>
          Continue
        </Link>
        <Link href="/sign-in" style={styles.link}>
          Sign in
        </Link>
        <Link href="/sign-up" style={styles.link}>
          Create an account
        </Link>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>Preview role shells</Text>
        <Link href="/caregiver" style={styles.link}>
          Caregiver home
        </Link>
        <Link href="/elder" style={styles.link}>
          Elder home
        </Link>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  link: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '600',
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: 'center',
  },
});
