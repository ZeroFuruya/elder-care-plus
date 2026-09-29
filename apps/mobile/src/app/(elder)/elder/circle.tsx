import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { SensitiveActionDialog } from '@/components/sensitive-action-dialog';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { consentToCareLink, listElderCircle, revokeCareLink, type ElderCircleLink } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

type PendingAction = { link: ElderCircleLink; action: 'consent' | 'revoke' };

/** The elder's view of who can see their record, with consent and revoke. */
export default function ElderCircleScreen() {
  const user = useSessionUser();
  const loader = useCallback(() => listElderCircle(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  if (state.status === 'loading') return <LoadingScreen message="Loading your care circle…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Care circle" showBack>
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const circle = state.data;

  const dialog = pending
    ? {
        title:
          pending.action === 'consent'
            ? `Approve ${pending.link.memberLabel}?`
            : `Remove ${pending.link.memberLabel}?`,
        description:
          pending.action === 'consent'
            ? 'They will be able to see your medicine record read-only. Everything stays in the history. Enter your password to approve.'
            : 'They will no longer see your record. The history is kept, and you can invite them again later. Enter your password to confirm.',
        confirmLabel: pending.action === 'consent' ? 'Approve access' : 'Remove access',
        danger: pending.action === 'revoke',
        action: () =>
          pending.action === 'consent'
            ? consentToCareLink(pending.link.linkId)
            : revokeCareLink(pending.link.linkId),
      }
    : null;

  return (
    <Screen
      title="Care circle"
      subtitle="Who can see your record"
      showBack
      onRefresh={reload}
      refreshing={refreshing}
    >
      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      {circle.length === 0 ? (
        <>
          <EmptyState
            title="No one is linked yet"
            description="Enter the six-digit code from your caregiver to link your accounts."
          />
          <Button label="Enter a caregiver’s code" onPress={() => router.replace('/elder/link')} />
        </>
      ) : (
        circle.map((link) => (
          <Card key={link.linkId} title={link.memberLabel}>
            <Text style={styles.body}>
              {link.memberRole === 'caregiver'
                ? 'Caregiver · can set up your medicine plan'
                : 'Family member · read-only'}
            </Text>
            <Text style={styles.state}>
              {link.status === 'active' ? 'Access active' : 'Waiting for your approval'}
            </Text>

            {link.status === 'invited' ? (
              <Button
                label="Approve access"
                onPress={() => setPending({ link, action: 'consent' })}
              />
            ) : null}

            <Button
              label={link.memberRole === 'caregiver' ? 'Remove caregiver access' : 'Remove access'}
              variant="secondary"
              onPress={() => setPending({ link, action: 'revoke' })}
            />
          </Card>
        ))
      )}

      {dialog ? (
        <SensitiveActionDialog
          visible
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          action={dialog.action}
          onCancel={() => setPending(null)}
          onSuccess={() => {
            const wasConsent = pending?.action === 'consent';
            const label = pending?.link.memberLabel ?? 'The family member';
            setBanner({
              tone: 'success',
              message: wasConsent
                ? `${label} can now see your record read-only.`
                : `${label} no longer has access to your record.`,
            });
            setPending(null);
            void reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.text,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
  state: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
    paddingBottom: spacing.xs,
  },
});
