import { helpRequestCategoryPresentation, helpRequestStatePresentation } from '@eldercare/shared';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import {
  acceptHelpRequest,
  completeHelpRequest,
  getLinkedElder,
  listHelpRequests,
  type HelpRequest,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateTime } from '@/lib/format';

type PendingAction = { request: HelpRequest; action: 'accept' | 'complete' };

/**
 * `C-Help` Caregiver Help Requests (docs/specs/sprint-8.md, Flow F).
 *
 * The caregiver is part of the circle the older adult notifies, so they can see the requests and
 * offer to help exactly like a family member. Reached from the notification centre.
 */
export default function CaregiverHelpScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);

  const loader = useCallback(async (): Promise<HelpRequest[] | null> => {
    const link = await getLinkedElder(user.id);
    if (!link) return null;
    return listHelpRequests(link.elderId);
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  async function run(action: PendingAction) {
    setPending(null);
    setWorking(true);
    setBanner(null);
    try {
      if (action.action === 'accept') await acceptHelpRequest(action.request.id);
      else await completeHelpRequest(action.request.id);
      setBanner({
        tone: 'success',
        message: action.action === 'accept' ? 'You are helping with this.' : 'Marked as done.',
      });
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

  if (state.status === 'loading') return <LoadingScreen message="Loading help requests…" />;
  if (state.status === 'error') {
    return <ScreenError title="Help requests" message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Help requests">
        <EmptyState
          title="No linked older adult"
          description="Link with the older adult first to see their help requests."
        />
      </Screen>
    );
  }

  const requests = state.data;
  const open = requests.filter(
    (request) => request.state === 'open' || request.state === 'accepted',
  );
  const closed = requests.filter(
    (request) => request.state === 'completed' || request.state === 'cancelled',
  );

  function actions(request: HelpRequest) {
    if (request.state === 'open') {
      return (
        <Button
          label="Offer to help"
          loading={working}
          onPress={() => setPending({ request, action: 'accept' })}
        />
      );
    }
    if (request.state === 'accepted' && request.acceptedBy === user.id) {
      return (
        <Button
          label="Mark as done"
          loading={working}
          onPress={() => setPending({ request, action: 'complete' })}
        />
      );
    }
    return null;
  }

  return (
    <Screen
      title="Help requests"
      subtitle="From the older adult"
      onRefresh={reload}
      refreshing={refreshing}
    >
      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="When the older adult asks for help it will appear here."
        />
      ) : (
        <>
          {open.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              styles={styles}
              actions={actions(request)}
            />
          ))}

          {closed.length > 0 ? <Text style={styles.sectionHeading}>Recent</Text> : null}
          {closed.map((request) => (
            <RequestCard key={request.id} request={request} styles={styles} actions={null} />
          ))}
        </>
      )}

      <ConfirmDialog
        visible={pending !== null}
        title={pending?.action === 'complete' ? 'Mark this request as done?' : 'Offer to help?'}
        description={
          pending?.action === 'complete'
            ? 'The older adult and the circle will see that this is complete.'
            : 'The older adult and the circle will see that you are helping.'
        }
        confirmLabel={pending?.action === 'complete' ? 'Mark as done' : 'Offer to help'}
        busy={working}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void run(pending);
        }}
      />
    </Screen>
  );
}

function RequestCard({
  request,
  styles,
  actions,
}: {
  request: HelpRequest;
  styles: ReturnType<typeof createStyles>;
  actions: ReactNode;
}) {
  const category = helpRequestCategoryPresentation[request.category];
  const requestState = helpRequestStatePresentation[request.state];

  return (
    <Card>
      <View style={styles.pillRow}>
        <StatusPill presentation={category} />
        <StatusPill presentation={requestState} />
      </View>
      <Text style={styles.note}>{request.note ?? 'No note'}</Text>
      <Text style={styles.meta}>
        Asked {formatDateTime(request.createdAt)}
        {request.acceptedByName ? ` · ${request.acceptedByName} is helping` : ''}
      </Text>
      {actions}
    </Card>
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
    sectionHeading: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
      paddingTop: spacing.sm,
      textTransform: 'uppercase',
    },
  });
}
