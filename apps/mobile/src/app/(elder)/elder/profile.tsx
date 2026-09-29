import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { userRoleLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Card } from '@/components/card';
import { DeactivateAccount } from '@/components/deactivate-account';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function ElderProfileScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen title="Profile" subtitle="Your account">
      <Card title="Signed in as">
        <View style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{user.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{userRoleLabels[user.role]}</Text>
        </View>
      </Card>

      <Card title="Your data">
        <Text style={styles.body}>
          Your care circle is stored on the ElderCare+ server: only the caregiver and family members
          you approve can see your record, and only read-only. Nothing is deleted — a record is only
          added.
        </Text>
      </Card>

      <DeactivateAccount />

      <LogoutButton size="large" />
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: {
      gap: spacing.xs,
    },
    label: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    value: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
    },
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
