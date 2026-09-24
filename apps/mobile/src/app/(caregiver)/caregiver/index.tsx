import { doseStatusPresentation, type DoseStatus } from '@eldercare/shared';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, radius, spacing, statusColors } from '@/constants/theme';
import {
  ensureDemoData,
  getLinkedElder,
  linkCaregiverToElder,
  listDoses,
  listDosesForDay,
  listRecentConfirmations,
  summarise,
  type AdherenceSummary,
  type CareLink,
  type DoseView,
} from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, endOfDay, formatRelative, formatTime, startOfDay } from '@/lib/format';
import { statusGlyph } from '@/lib/status-glyph';

interface DashboardData {
  link: CareLink | null;
  today: DoseView[];
  todaySummary: AdherenceSummary;
  recent: DoseView[];
  weekSummary: AdherenceSummary;
}

const EMPTY_SUMMARY: AdherenceSummary = { taken: 0, missed: 0, due: 0, upcoming: 0, percent: 0 };

function StatTile({ status, value }: { status: DoseStatus; value: number }) {
  const presentation = doseStatusPresentation[status];
  const color = statusColors[presentation.tone];

  return (
    <View style={styles.tile} accessibilityLabel={`${presentation.label}: ${value}`}>
      <Text style={[styles.tileGlyph, { color }]}>{statusGlyph(presentation.icon)}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{presentation.label}</Text>
    </View>
  );
}

export default function CaregiverDashboardScreen() {
  const user = useSessionUser();

  const loader = useCallback(async (): Promise<DashboardData> => {
    const link = await getLinkedElder(user.id);
    if (!link) {
      return {
        link: null,
        today: [],
        todaySummary: EMPTY_SUMMARY,
        recent: [],
        weekSummary: EMPTY_SUMMARY,
      };
    }

    const now = new Date();
    const [today, recent, weekDoses] = await Promise.all([
      listDosesForDay(link.elderId, now),
      listRecentConfirmations(link.elderId, 5),
      listDoses(link.elderId, { from: startOfDay(addDays(now, -6)), to: endOfDay(now), now }),
    ]);

    return {
      link,
      today,
      todaySummary: summarise(today),
      recent,
      weekSummary: summarise(weekDoses),
    };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);
  const [linking, setLinking] = useState(false);

  const linkDemoElder = async () => {
    setLinking(true);
    const { elderId } = await ensureDemoData();
    await linkCaregiverToElder(user.id, elderId);
    setLinking(false);
    await reload();
  };

  if (state.status === 'loading') return <LoadingScreen message="Loading the dashboard…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Dashboard" showBell>
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const { link, today, todaySummary, recent, weekSummary } = state.data;

  if (!link) {
    return (
      <Screen title="Dashboard" showBell onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No older adult linked yet"
          description="A caregiver account is linked to one older adult. Link the demonstration account to continue."
        />
        <Button label="Link the demo older adult" onPress={linkDemoElder} loading={linking} />
      </Screen>
    );
  }

  const missedToday = today.filter((dose) => dose.status === 'missed');
  const remaining = today.filter((dose) => dose.status === 'due' || dose.status === 'upcoming');

  return (
    <Screen
      title="Dashboard"
      subtitle="Family caregiver view"
      showBell
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card>
        <Text style={styles.elderName}>{link.elderName}</Text>
        <Text style={styles.elderMeta}>
          Linked older adult · {todaySummary.taken} of {today.length} doses confirmed today
        </Text>
      </Card>

      <View style={styles.tiles}>
        <StatTile status="taken" value={todaySummary.taken} />
        <StatTile status="due" value={todaySummary.due} />
        <StatTile status="missed" value={todaySummary.missed} />
      </View>

      <Card title="Seven-day adherence">
        <Text style={styles.adherence}>{weekSummary.percent}%</Text>
        <Text style={styles.elderMeta}>
          {weekSummary.taken} confirmed · {weekSummary.missed} missed in the last seven days
        </Text>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Needs attention</Text>
        {missedToday.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            description="No dose has passed its grace period without a confirmation today."
          />
        ) : (
          missedToday.map((dose) => <DoseCard key={dose.id} dose={dose} />)
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Still to come today</Text>
        {remaining.length === 0 ? (
          <Text style={styles.body}>Every remaining dose today has already been confirmed.</Text>
        ) : (
          remaining.map((dose) => <DoseCard key={dose.id} dose={dose} />)
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent confirmations</Text>
        {recent.length === 0 ? (
          <Text style={styles.body}>No confirmation has been recorded yet.</Text>
        ) : (
          recent.map((dose) => (
            <Card key={dose.id}>
              <Text style={styles.confirmation}>
                {dose.medicine} {dose.strength}
              </Text>
              <Text style={styles.elderMeta}>
                Taken at {dose.takenAt ? formatTime(dose.takenAt) : '—'} ·{' '}
                {dose.takenAt ? formatRelative(dose.takenAt) : ''}
              </Text>
            </Card>
          ))
        )}
      </View>

      <Text style={styles.note}>
        Confirmations are recorded by the older adult and appear here automatically. The caregiver
        view is read-only for dose events.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  elderName: {
    color: colors.text,
    fontSize: fontSize.heading,
    fontWeight: '700',
    lineHeight: lineHeight.heading,
  },
  elderMeta: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  tileGlyph: {
    fontSize: fontSize.heading,
    fontWeight: '700',
  },
  tileValue: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: '700',
    lineHeight: lineHeight.title,
  },
  tileLabel: {
    color: colors.textMuted,
    fontSize: fontSize.tabLabel,
    fontWeight: '600',
    textAlign: 'center',
  },
  adherence: {
    color: colors.success,
    fontSize: fontSize.title,
    fontWeight: '700',
    lineHeight: lineHeight.title,
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
  confirmation: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: '600',
    lineHeight: lineHeight.body,
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
