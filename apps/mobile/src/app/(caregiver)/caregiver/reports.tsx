import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, radius, spacing } from '@/constants/theme';
import { getLinkedElder, listDoses, summarise, type AdherenceSummary, type CareLink } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, endOfDay, formatShortDate, isSameDay, startOfDay } from '@/lib/format';

interface DayReport {
  label: string;
  count: number;
  summary: AdherenceSummary;
}

interface ReportData {
  link: CareLink | null;
  overall: AdherenceSummary;
  days: DayReport[];
}

export default function CaregiverReportsScreen() {
  const user = useSessionUser();

  const loader = useCallback(async (): Promise<ReportData> => {
    const link = await getLinkedElder(user.id);
    if (!link) {
      const empty: AdherenceSummary = { taken: 0, missed: 0, due: 0, upcoming: 0, percent: 0 };
      return { link: null, overall: empty, days: [] };
    }

    const now = new Date();
    const doses = await listDoses(link.elderId, {
      from: startOfDay(addDays(now, -6)),
      to: endOfDay(now),
      now,
    });

    const days: DayReport[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = addDays(now, -offset);
      const dayDoses = doses.filter((dose) => isSameDay(dose.scheduledAt, day));
      days.push({
        label: offset === 0 ? 'Today' : offset === 1 ? 'Yesterday' : formatShortDate(day),
        count: dayDoses.length,
        summary: summarise(dayDoses),
      });
    }

    return { link, overall: summarise(doses), days };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Building the report…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Reports">
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const { link, overall, days } = state.data;

  if (!link) {
    return (
      <Screen title="Reports" onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="Nothing to report yet"
          description="Link an older adult account to see their confirmation history."
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Reports"
      subtitle={`Last 7 days · ${link.elderName}`}
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card title="Confirmation rate">
        <Text style={styles.big}>{overall.percent}%</Text>
        <Text style={styles.meta}>
          {overall.taken} confirmed · {overall.missed} missed
        </Text>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Day by day</Text>
        {days.map((day) => (
          <View key={day.label} style={styles.row}>
            <Text style={styles.day}>{day.label}</Text>
            <Text style={styles.dayValue}>
              {day.count === 0 ? 'No doses' : `${day.summary.taken} of ${day.count} confirmed`}
            </Text>
            {day.summary.missed > 0 ? (
              <Text style={styles.missed}>! {day.summary.missed} missed</Text>
            ) : null}
          </View>
        ))}
      </View>

      <Text style={styles.note}>
        A dose counts as missed when its grace period passes with no confirmation recorded. No
        record is ever deleted, so the history stays complete.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
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
