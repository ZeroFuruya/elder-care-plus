import { StyleSheet, Text, View } from 'react-native';

import { userRoleLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Card } from '@/components/card';
import { DeactivateAccount } from '@/components/deactivate-account';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';

export default function ElderProfileScreen() {
  const user = useSessionUser();

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
          Doses you confirm are recorded on the ElderCare+ server and shared with the caregiver and
          family members you approved. Nothing is deleted — a record is only added.
        </Text>
      </Card>

      <DeactivateAccount />

      <LogoutButton size="large" />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
