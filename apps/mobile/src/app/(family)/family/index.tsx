import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DeactivateAccount } from '@/components/deactivate-account';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { listMyLinks } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * Connected family member: read-only view of the elder they are linked to.
 * The adherence cards themselves arrive with Sprint 4 (checking requirement);
 * this screen is their mount point.
 */
export default function FamilyHomeScreen() {
  const user = useSessionUser();
  const loader = useCallback(() => listMyLinks(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your record…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Family view">
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const links = state.data;
  const active = links.find((link) => link.status === 'active') ?? null;
  const invited = links.find((link) => link.status === 'invited') ?? null;
  const wasRevoked = !active && !invited && links.some((link) => link.status === 'revoked');

  if (active) {
    return (
      <Screen
        title="Family view"
        subtitle="Read-only access"
        onRefresh={reload}
        refreshing={refreshing}
      >
        <Card title="You can see">
          <Text style={styles.name}>{active.elderName ?? 'Your older adult'}</Text>
          <Text style={styles.body}>
            Read-only access: only the older adult and their caregiver can change anything.
          </Text>
        </Card>

        <Card title="Medication activity">
          <EmptyState
            title="No activity yet"
            description="Confirmed doses appear here as the older adult records them."
          />
        </Card>

        <DeactivateAccount />

        <LogoutButton size="large" />
      </Screen>
    );
  }

  if (invited) {
    return (
      <Screen
        title="Family view"
        subtitle="Waiting for approval"
        onRefresh={reload}
        refreshing={refreshing}
      >
        <Banner
          tone="info"
          message="Your request was sent. The older adult must approve it before you can see their record."
        />
        <Button
          label="Enter a different invite code"
          variant="secondary"
          onPress={() => router.push('/family/link')}
        />
        <LogoutButton size="large" />
      </Screen>
    );
  }

  return (
    <Screen title="Family view" onRefresh={reload} refreshing={refreshing}>
      <EmptyState
        title={wasRevoked ? 'Your access was removed' : 'No record is shared with you'}
        description={
          wasRevoked
            ? 'The older adult or their caregiver removed your access. Ask them for a new invite code if this was unexpected.'
            : 'Ask your family caregiver for a six-digit invite code, then enter it here.'
        }
      />
      <Button label="Enter an invite code" onPress={() => router.push('/family/link')} />
      <LogoutButton size="large" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: {
    color: colors.text,
    fontSize: fontSize.heading,
    fontWeight: '700',
    lineHeight: lineHeight.heading,
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    paddingBottom: spacing.xs,
  },
});
