import { helpRequestCategoryPresentation, helpRequestStatePresentation } from '@eldercare/shared';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { acceptHelpRequest, completeHelpRequest, getHelpRequest, type HelpRequest } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateTime } from '@/lib/format';

type PendingAction = 'accept' | 'complete';

/**
 * `F-12` Help Request Detail and `F-13` confirmation (docs/specs/sprint-8.md).
 *
 * Read view of one request with the two member actions: offer to help (accept) while it is open,
 * and mark it done once you are the accepter. The state is confirmed by the database, and the
 * confirmation banner is the `F-13` acknowledgement.
 */
export default function FamilyHelpDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = typeof id === 'string' ? id : '';
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);

  const loader = useCallback(async (): Promise<HelpRequest | null> => {
    if (requestId.length === 0) return null;
    return getHelpRequest(requestId);
  }, [requestId]);

  const { state, refreshing, reload } = useAsyncData(loader);

  async function run(action: PendingAction) {
    setPending(null);
    setWorking(true);
    try {
      if (action === 'accept') {
        await acceptHelpRequest(requestId);
        setBanner({
          tone: 'success',
          message: 'Thank you. The older adult can see you are helping.',
        });
      } else {
        await completeHelpRequest(requestId);
        setBanner({ tone: 'success', message: 'Marked as done. Thank you for helping.' });
      }
      reload();
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Try again.',
      });
    } finally {
      setWorking(false);
    }
  }

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return <ScreenError title="Help" showBack message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Help" showBack safeBottom>
        <EmptyState title="Request not found" description="It may have been removed." />
      </Screen>
    );
  }

  const request = state.data;
  const category = helpRequestCategoryPresentation[request.category];
  const requestState = helpRequestStatePresentation[request.state];
  const isAccepter = request.acceptedBy !== null && request.acceptedBy === user.id;

  return (
    <Screen title="Help request" showBack safeBottom onRefresh={reload} refreshing={refreshing}>
      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <Card>
        <View style={styles.pillRow}>
          <StatusPill presentation={category} />
          <StatusPill presentation={requestState} />
        </View>
        <Text style={styles.note}>{request.note ?? 'No note'}</Text>
        <Text style={styles.meta}>Asked {formatDateTime(request.createdAt)}</Text>
        {request.acceptedByName ? (
          <Text style={styles.meta}>{request.acceptedByName} is helping.</Text>
        ) : null}
      </Card>

      {request.state === 'open' ? (
        <Button
          label="Offer to help"
          loading={working}
          onPress={() => setPending('accept')}
          accessibilityHint="Claims this request so the older adult knows you will help"
        />
      ) : null}

      {request.state === 'accepted' && isAccepter ? (
        <Button label="Mark as done" loading={working} onPress={() => setPending('complete')} />
      ) : null}

      {request.state === 'accepted' && !isAccepter ? (
        <Banner tone="info" message="Someone in the circle is already helping with this." />
      ) : null}

      <ConfirmDialog
        visible={pending !== null}
        title={pending === 'complete' ? 'Mark this request as done?' : 'Offer to help?'}
        description={
          pending === 'complete'
            ? 'The older adult and the circle will see that this is complete.'
            : 'The older adult and the circle will see that you are helping.'
        }
        confirmLabel={pending === 'complete' ? 'Mark as done' : 'Offer to help'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void run(pending);
        }}
      />
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    note: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      paddingTop: spacing.sm,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
