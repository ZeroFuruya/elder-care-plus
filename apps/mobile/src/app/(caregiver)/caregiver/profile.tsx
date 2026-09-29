import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { userRoleLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DeactivateAccount } from '@/components/deactivate-account';
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
          {state.status !== 'ready'
            ? 'Checking…'
            : state.data
              ? (state.data.elderName ?? 'Linked')
              : 'None linked'}
        </Text>
        <Text style={styles.body}>
          A caregiver account follows one older adult. Their doses and confirmations appear on the
          dashboard and in reports.
        </Text>
        {state.status === 'ready' && state.data ? (
          <>
            <Button
              label="Elder profile"
              variant="secondary"
              onPress={() => router.push('/caregiver/elder')}
              accessibilityHint="Opens the older adult's emergency information"
            />
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => router.push('/caregiver/elder-edit')}
              accessibilityHint="Opens the elder profile form"
            />
          </>
        ) : null}
        <Button
          label="Care links and invites"
          variant="secondary"
          onPress={() => router.push('/caregiver/link')}
          accessibilityHint="Opens the link code and family member invites"
        />
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
