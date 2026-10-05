import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  ensureDoseEvents,
  listDoses,
  listMyLinks,
  summarise,
  type AdherenceSummary,
  type DoseView,
  type MyLink,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, endOfDay, startOfDay } from '@/lib/format';

/**
 * `F-03` Family Home / `F-10` Care Summary (docs/specs/sprint-8.md).
 *
 * The connected family member's read-only entry point: who they can see, a short care summary and
 * the recent dose activity. The full plan and the appointment list live on their own tabs, and the
 * account actions live on `More`. Nothing here writes.
 */

interface FamilyData {
  links: MyLink[];
  doses: DoseView[];
  summary: AdherenceSummary;
}

const EMPTY_SUMMARY: AdherenceSummary = { taken: 0, missed: 0, due: 0, upcoming: 0, percent: 0 };

export default function FamilyHomeScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(async (): Promise<FamilyData> => {
    const links = await listMyLinks(user.id);
    const active = links.find((link) => link.status === 'active') ?? null;
    if (!active) return { links, doses: [], summary: EMPTY_SUMMARY };

    await ensureDoseEvents(active.elderId).catch(() => undefined);
    const now = new Date();
    const doses = await listDoses(active.elderId, {
      from: startOfDay(addDays(now, -6)),
      to: endOfDay(now),
      now,
    });
    return { links, doses, summary: summarise(doses) };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your record…" />;
  if (state.status === 'error') {
    return <ScreenError title="Family view" message={state.message} onRetry={reload} safeBottom />;
  }

  const { links, doses, summary } = state.data;
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

        <Card title="Care summary">
          <Text style={styles.summary}>
            {summary.taken} taken · {summary.missed} missed · {summary.due} due · {summary.upcoming}{' '}
            upcoming
          </Text>
          <Text style={styles.body}>Last 7 days.</Text>
        </Card>

        <Button label="See medicines" onPress={() => router.push('/family/meds')} />
        <Button
          label="See visits"
          variant="secondary"
          onPress={() => router.push('/family/calendar')}
        />

        {doses.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Confirmed doses appear here as the older adult records them."
          />
        ) : (
          doses.map((dose) => <DoseCard key={dose.id} dose={dose} />)
        )}
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

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    name: {
      color: colors.text,
      fontSize: fontSize.heading,
      fontWeight: '700',
      lineHeight: lineHeight.heading,
    },
    summary: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
      paddingBottom: spacing.xs,
    },
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
