import { useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  getLinkedElder,
  listAvailability,
  listElderCircle,
  type ElderCircleLink,
  type MemberAvailability,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

interface CircleData {
  circle: ElderCircleLink[];
  availability: MemberAvailability[];
}

/**
 * `F-14` Family Care Circle (docs/specs/sprint-8.md).
 *
 * Read-only: the caregiver and the other connected relatives, with who has active access and
 * whether they have marked themselves available (`F-15`). The list is served by the Sprint 8
 * co-member read (`care_links_select_active_circle`); a pending invite is hidden from co-members
 * until the elder consents.
 */
export default function FamilyCircleScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(async (): Promise<CircleData | null> => {
    const link = await getLinkedElder(user.id);
    if (!link) return null;
    const [circle, availability] = await Promise.all([
      listElderCircle(link.elderId),
      listAvailability(link.elderId),
    ]);
    return { circle, availability };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading the care circle…" />;
  if (state.status === 'error') {
    return <ScreenError title="Care circle" message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Care circle" onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No record is shared with you"
          description="Ask your family caregiver for a six-digit invite code, then enter it on the Home tab."
        />
      </Screen>
    );
  }

  const { circle, availability } = state.data;
  const availabilityByMember = new Map(availability.map((row) => [row.memberId, row]));

  return (
    <Screen title="Care circle" subtitle="Read-only" onRefresh={reload} refreshing={refreshing}>
      {circle.length === 0 ? (
        <EmptyState
          title="No one is linked yet"
          description="The people who help care for the older adult will appear here."
        />
      ) : (
        circle.map((link) => {
          const availabilityRow = availabilityByMember.get(link.memberId);
          return (
            <Card key={link.linkId} title={link.memberLabel}>
              <Text style={styles.body}>
                {link.memberRole === 'caregiver'
                  ? 'Caregiver · manages the care plan'
                  : 'Family member · read-only'}
              </Text>
              <Text style={styles.state}>
                {link.status === 'active'
                  ? 'Access active'
                  : 'Waiting for the older adult’s approval'}
              </Text>
              {availabilityRow ? (
                <Text style={styles.availability}>
                  {availabilityRow.isAvailable ? 'Available to help' : 'Not available'}
                  {availabilityRow.note ? ` — ${availabilityRow.note}` : ''}
                </Text>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
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
      paddingTop: spacing.xs,
    },
    availability: {
      color: colors.text,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
      paddingTop: spacing.xs,
    },
  });
}
