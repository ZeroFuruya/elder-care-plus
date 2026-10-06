import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { ReportRangeChips } from '@/components/report-range-chips';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import {
  cardSurface,
  fontSize,
  lineHeight,
  spacing,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';
import {
  getAdherenceReport,
  getLinkedElder,
  type AdherenceReport,
  type MyLink,
  type ReportRange,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, formatShortDate, parseDayOnly, toIsoDay } from '@/lib/format';

interface ReportData {
  link: MyLink | null;
  report: AdherenceReport | null;
}

/**
 * `C-09` Adherence Report (docs/specs/sprint-9.md).
 *
 * A server-aggregated, read-only report over 7/30/90 days. The server buckets each
 * occurrence by its stored local date and returns counts only, so the screen never
 * downloads the underlying dose rows and there is no write control anywhere. The
 * one entry point leads to the `C-12` care-activity timeline.
 */
export default function CaregiverReportsScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const [range, setRange] = useState<ReportRange>(7);

  const loader = useCallback(async (): Promise<ReportData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { link: null, report: null };

    const report = await getAdherenceReport(link.elderId, range);
    return { link, report };
  }, [user.id, range]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Building the report…" />;
  if (state.status === 'error') {
    return <ScreenError title="Reports" message={state.message} onRetry={reload} />;
  }

  const { link, report } = state.data;

  if (!link || !report) {
    return (
      <Screen title="Reports" onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="Nothing to report yet"
          description="Link an older adult account to see their confirmation history."
        />
      </Screen>
    );
  }

  const { totals, days } = report;
  const today = toIsoDay(new Date());
  const yesterday = toIsoDay(addDays(new Date(), -1));
  const missedDays = days.filter((day) => day.missed > 0);

  function dayLabel(isoDay: string): string {
    if (isoDay === today) return 'Today';
    if (isoDay === yesterday) return 'Yesterday';
    return formatShortDate(parseDayOnly(isoDay));
  }

  return (
    <Screen
      title="Reports"
      subtitle={`Last ${range} days · ${link.elderName ?? 'your older adult'}`}
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card title="Period">
        <ReportRangeChips value={range} onChange={setRange} />
      </Card>

      <Card title="Confirmation rate">
        <Text style={styles.big}>{totals.percent}%</Text>
        <Text style={styles.meta}>
          {totals.taken} confirmed · {totals.missed} missed
          {totals.open > 0 ? ` · ${totals.open} still due` : ''}
        </Text>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Day by day</Text>
        {days.map((day) => (
          <View key={day.date} style={styles.row}>
            <Text style={styles.day}>{dayLabel(day.date)}</Text>
            <Text style={styles.dayValue}>
              {day.expected === 0 ? 'No doses' : `${day.taken} of ${day.settled} confirmed`}
            </Text>
            {day.missed > 0 ? <Text style={styles.missed}>&#33; {day.missed} missed</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Missed doses</Text>
        {missedDays.length === 0 ? (
          <Text style={styles.note}>No missed doses in this period.</Text>
        ) : (
          missedDays.map((day) => (
            <View key={day.date} style={styles.row}>
              <Text style={styles.day}>{dayLabel(day.date)}</Text>
              <Text style={styles.missed}>
                &#33; {day.missed} {day.missed === 1 ? 'dose' : 'doses'} missed
              </Text>
            </View>
          ))
        )}
      </View>

      <Button
        label="Care activity"
        variant="secondary"
        onPress={() => router.push('/caregiver/activity')}
      />

      <Text style={styles.note}>
        A dose counts as missed once the server records the missed fact after its grace period with
        no confirmation. No record is ever deleted, so the history stays complete.
      </Text>
    </Screen>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    big: {
      color: colors.text,
      fontSize: fontSize.title,
      fontWeight: '700',
      lineHeight: lineHeight.title,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
      textTransform: 'uppercase',
    },
    row: {
      ...cardSurface(colors, elevation, gradients),
      gap: spacing.xs,
      padding: spacing.md,
    },
    day: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    dayValue: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    missed: {
      color: colors.danger,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
    },
    note: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
