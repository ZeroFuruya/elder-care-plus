import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { userRoleLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { getLinkedElder } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

export default function CaregiverProfileScreen() {
  const user = useSessionUser();
  const loader = useCallback(() => getLinkedElder(user.id), [user.id]);
  const { state } = useAsyncData(loader);

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

      <Card title="Linked older adult">
        <Text style={styles.value}>
          {state.status === 'ready' && state.data ? state.data.elderName : 'None linked'}
        </Text>
        <Text style={styles.body}>
          A caregiver account follows exactly one older adult in this release, so the dashboard
          shows that person&apos;s doses and confirmations.
        </Text>
      </Card>

      <Card title="Local database">
        <Text style={styles.body}>
          Everything the app stores lives in a SQLite database on this device. Open the read-only
          viewer to show its tables and rows.
        </Text>
        <Button
          label="View database"
          variant="secondary"
          onPress={() => router.push('/database')}
          accessibilityHint="Opens a read-only list of the local database tables and their rows"
        />
      </Card>

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
