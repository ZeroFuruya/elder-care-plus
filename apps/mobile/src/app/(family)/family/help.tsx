import { helpRequestCategoryPresentation, helpRequestStatePresentation } from '@eldercare/shared';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import {
  cardSurface,
  fontSize,
  lineHeight,
  spacing,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';
import { getLinkedElder, listHelpRequests, type HelpRequest } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateTime } from '@/lib/format';

/**
 * `F-11` Family Help Requests (docs/specs/sprint-8.md). The older adult's open and recent
 * requests, newest first. Tapping one opens `F-12` to offer help.
 */
export default function FamilyHelpScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const loader = useCallback(async (): Promise<HelpRequest[] | null> => {
    const link = await getLinkedElder(user.id);
    if (!link) return null;
    return listHelpRequests(link.elderId);
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading help requests…" />;
  if (state.status === 'error') {
    return <ScreenError title="Help" message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Help" onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No record is shared with you"
          description="Ask your family caregiver for a six-digit invite code, then enter it on the Home tab."
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

  return (
    <Screen title="Help" subtitle="From the older adult" onRefresh={reload} refreshing={refreshing}>
      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="When the older adult asks for help it will appear here, and you can offer to take it."
        />
      ) : (
        <>
          {open.map((request) => (
            <RequestCard key={request.id} request={request} styles={styles} />
          ))}

          {closed.length > 0 ? <Text style={styles.sectionHeading}>Recent</Text> : null}
          {closed.map((request) => (
            <RequestCard key={request.id} request={request} styles={styles} />
          ))}
        </>
      )}
    </Screen>
  );
}

function RequestCard({
  request,
  styles,
}: {
  request: HelpRequest;
  styles: ReturnType<typeof createStyles>;
}) {
  const category = helpRequestCategoryPresentation[request.category];
  const requestState = helpRequestStatePresentation[request.state];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.label} help request, ${requestState.label.toLowerCase()}`}
      accessibilityHint="Opens the request details"
      onPress={() => router.push(`/family/help-detail?id=${request.id}`)}
    >
      <View style={styles.card}>
        <View style={styles.pillRow}>
          <StatusPill presentation={category} />
          <StatusPill presentation={requestState} />
        </View>
        <Text style={styles.note}>{request.note ?? 'No note'}</Text>
        <Text style={styles.meta}>
          Asked {formatDateTime(request.createdAt)}
          {request.state === 'accepted' || request.state === 'completed'
            ? request.acceptedByName
              ? ` · ${request.acceptedByName} is helping`
              : ' · Someone is helping'
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, elevation, gradients),
      gap: spacing.sm,
      padding: spacing.md,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    note: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
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
