import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { LogoutButton } from '@/components/logout-button';
import { ReportRangeChips } from '@/components/report-range-chips';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  ensureDoseEvents,
  getAdherenceReport,
  listDoses,
  listMyLinks,
  type AdherenceReport,
  type DoseView,
  type MyLink,
  type ReportRange,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, endOfDay, startOfDay } from '@/lib/format';

/**
 * `F-03` Family Home / `F-10` Care Summary (docs/specs/sprint-8.md, sprint-9.md).
 *
 * The connected family member's read-only entry point: who they can see, a care
 * summary over 7/30/90 days, and the recent dose activity. The summary is the
 * server-aggregated report, so it carries counts only — no dose, medicine or
 * timestamp (docs/specs/sprint-9.md OD2). Nothing here writes.
 */

interface FamilyData {
  links: MyLink[];
  doses: DoseView[];
  report: AdherenceReport | null;
}

export default function FamilyHomeScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [range, setRange] = useState<ReportRange>(7);

  const loader = useCallback(async (): Promise<FamilyData> => {
    const links = await listMyLinks(user.id);
    const active = links.find((link) => link.status === 'active') ?? null;
    if (!active) return { links, doses: [], report: null };

    await ensureDoseEvents(active.elderId).catch(() => undefined);
    const now = new Date();
    const [doses, report] = await Promise.all([
      listDoses(active.elderId, {
        from: startOfDay(addDays(now, -6)),
        to: endOfDay(now),
        now,
      }),
      getAdherenceReport(active.elderId, range),
    ]);
    return { links, doses, report };
  }, [user.id, range]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your record…" />;
  if (state.status === 'error') {
    return <ScreenError title="Family view" message={state.message} onRetry={reload} safeBottom />;
  }

  const { links, doses, report } = state.data;
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
          <ReportRangeChips value={range} onChange={setRange} />
          {report ? (
            <>
              <Text style={styles.summary}>
                {report.totals.taken} confirmed · {report.totals.missed} missed
                {report.totals.open > 0 ? ` · ${report.totals.open} still due` : ''}
              </Text>
              <Text style={styles.body}>
                {report.totals.percent}% confirmed over the last {range} days. This is a summary
                only.
              </Text>
            </>
          ) : (
            <Text style={styles.body}>No summary is available yet.</Text>
          )}
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
