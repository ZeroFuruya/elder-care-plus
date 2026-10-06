import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Card } from '@/components/card';
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
import { getAdherenceReport, type AdherenceReport, type ReportRange } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, formatShortDate, parseDayOnly, toIsoDay } from '@/lib/format';

/**
 * `E-08` Personal Adherence (docs/specs/sprint-9.md).
 *
 * The elder's own adherence history, read-only. It is the same server-aggregated
 * report the caregiver sees; the elder's capability is "personal daily history",
 * so there is no editing control and nothing to write.
 */
export default function ElderAdherenceScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const [range, setRange] = useState<ReportRange>(7);

  const loader = useCallback(
    (): Promise<AdherenceReport> => getAdherenceReport(user.id, range),
    [user.id, range],
  );

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your history…" />;
  if (state.status === 'error') {
    return (
      <ScreenError
        title="My adherence"
        message={state.message}
        onRetry={reload}
        showBack
        safeBottom
      />
    );
  }

  const { totals, days } = state.data;
  const today = toIsoDay(new Date());
  const yesterday = toIsoDay(addDays(new Date(), -1));

  function dayLabel(isoDay: string): string {
    if (isoDay === today) return 'Today';
    if (isoDay === yesterday) return 'Yesterday';
    return formatShortDate(parseDayOnly(isoDay));
  }

  return (
    <Screen
      title="My adherence"
      subtitle={`Last ${range} days`}
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card title="Period">
        <ReportRangeChips value={range} onChange={setRange} />
      </Card>

      <Card title="How it is going">
        <Text style={styles.big}>{totals.percent}%</Text>
        <Text style={styles.meta}>
          {totals.taken} confirmed · {totals.missed} missed
          {totals.open > 0 ? ` · ${totals.open} still to take` : ''}
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

      <Text style={styles.note}>
        This is your record. It is never deleted, and your caregiver can see the same history.
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
