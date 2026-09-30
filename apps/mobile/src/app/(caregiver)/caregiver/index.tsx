import { doseStatusPresentation, type DoseStatus } from '@eldercare/shared';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
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
  countUnreadNotifications,
  getDoseStockOutcome,
  getElderProfile,
  getLinkedElder,
  listDoses,
  listDosesForDay,
  listRecentConfirmations,
  summarise,
  type AdherenceSummary,
  type DoseStockOutcome,
  type DoseView,
  type MyLink,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { useDoseRealtime } from '@/hooks/use-dose-realtime';
import { addDays, endOfDay, formatRelative, formatTime, startOfDay } from '@/lib/format';

interface ConfirmationRow {
  dose: DoseView;
  stock: DoseStockOutcome | null;
}

interface DashboardData {
  link: MyLink | null;
  /**
   * Whether the linked elder has an `elder_profiles` row yet. `false` is the caregiver setup
   * state: `C-01` shows the create-profile prompt instead of the dashboard
   * (docs/specs/sprint-2.md).
   */
  hasElderProfile: boolean;
  today: DoseView[];
  todaySummary: AdherenceSummary;
  recent: ConfirmationRow[];
  weekSummary: AdherenceSummary;
  unread: number;
}

const EMPTY_SUMMARY: AdherenceSummary = { taken: 0, missed: 0, due: 0, upcoming: 0, percent: 0 };

function StatTile({ status, value }: { status: DoseStatus; value: number }) {
  const presentation = doseStatusPresentation[status];
  const { colors, elevation, gradients, statusColors } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );
  const color = statusColors[presentation.tone];

  return (
    <View style={styles.tile} accessibilityLabel={`${presentation.label}: ${value}`}>
      <Icon name={presentation.icon} size={18} color={color} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{presentation.label}</Text>
    </View>
  );
}

export default function CaregiverDashboardScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const loader = useCallback(async (): Promise<DashboardData> => {
    const link = await getLinkedElder(user.id);
    if (!link) {
      return {
        link: null,
        hasElderProfile: false,
        today: [],
        todaySummary: EMPTY_SUMMARY,
        recent: [],
        weekSummary: EMPTY_SUMMARY,
        unread: await countUnreadNotifications(),
      };
    }

    const now = new Date();
    const [profile, today, recentDoses, weekDoses, unread] = await Promise.all([
      getElderProfile(link.elderId),
      listDosesForDay(link.elderId, now),
      listRecentConfirmations(link.elderId, 5),
      listDoses(link.elderId, { from: startOfDay(addDays(now, -6)), to: endOfDay(now), now }),
      countUnreadNotifications(),
    ]);

    const recent = await Promise.all(
      recentDoses.map(async (dose) => ({ dose, stock: await getDoseStockOutcome(dose.id) })),
    );

    return {
      link,
      hasElderProfile: profile !== null,
      today,
      todaySummary: summarise(today),
      recent,
      weekSummary: summarise(weekDoses),
      unread,
    };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);
  const activeElderId = state.status === 'ready' ? (state.data.link?.elderId ?? null) : null;
  useDoseRealtime(activeElderId, reload);

  if (state.status === 'loading') return <LoadingScreen message="Loading the dashboard…" />;
  if (state.status === 'error') {
    return <ScreenError title="Dashboard" showBell message={state.message} onRetry={reload} />;
  }

  const { link, hasElderProfile, today, todaySummary, recent, weekSummary, unread } = state.data;

  if (!link) {
    return (
      <Screen title="Dashboard" showBell onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No older adult linked yet"
          description="Link an older adult with a six-digit code so their doses can be recorded here."
        />
        <Button label="Link an older adult" onPress={() => router.push('/caregiver/link')} />
      </Screen>
    );
  }

  // Caregiver setup: a linked older adult with no profile row yet gets a prompt rather than an
  // automatic redirect, so the back button is never trapped (owner decision 2026-10-01). Saving
  // in `A-09` creates the row, so the prompt clears on the next focus read.
  if (!hasElderProfile) {
    return (
      <Screen title="Dashboard" showBell onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No emergency information yet."
          description="Create the older adult's care and emergency profile."
        />
        <Button
          label="Create elder profile"
          onPress={() => router.push('/caregiver/elder-new')}
          accessibilityHint="Opens the elder profile form"
        />
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
        <Text style={styles.elderName}>{link.elderName ?? 'Your older adult'}</Text>
        <Text style={styles.elderMeta}>
          Linked older adult · {todaySummary.taken} of {today.length} doses confirmed today
        </Text>
      </Card>

      <Card title="Notifications">
        <Text style={styles.confirmation}>Unread: {unread}</Text>
        <Button
          label="Open notifications"
          variant="secondary"
          onPress={() => router.push('/notifications')}
          accessibilityHint="Opens the list of dose confirmations and missed doses"
        />
      </Card>

      <Button
        label="Care links and invites"
        variant="secondary"
        onPress={() => router.push('/caregiver/link')}
        accessibilityHint="Opens the code you share with the older adult, and family member invites"
      />

      <View style={styles.tiles}>
        <StatTile status="taken" value={todaySummary.taken} />
        <StatTile status="due" value={todaySummary.due} />
        <StatTile status="missed" value={todaySummary.missed} />
      </View>

      <Card title="Seven-day adherence">
        <Text style={styles.adherence}>
          {weekSummary.taken + weekSummary.missed === 0 ? '—' : `${weekSummary.percent}%`}
        </Text>
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
          missedToday.map((dose) => (
            <DoseCard
              key={dose.id}
              dose={dose}
              onPress={() => router.push(`/caregiver/dose?id=${dose.id}`)}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Still to come today</Text>
        {remaining.length === 0 ? (
          <Text style={styles.body}>Every remaining dose today has already been confirmed.</Text>
        ) : (
          remaining.map((dose) => (
            <DoseCard
              key={dose.id}
              dose={dose}
              onPress={() => router.push(`/caregiver/dose?id=${dose.id}`)}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent confirmations</Text>
        {recent.length === 0 ? (
          <Text style={styles.body}>No confirmation has been recorded yet.</Text>
        ) : (
          recent.map(({ dose, stock }) => (
            <Card key={dose.id}>
              <Text style={styles.confirmation}>
                {dose.medicine} {dose.strength}
              </Text>
              <Text style={styles.elderMeta}>
                Taken at {dose.takenAt ? formatTime(dose.takenAt) : '—'} ·{' '}
                {dose.takenAt ? formatRelative(dose.takenAt) : ''}
              </Text>
              {stock ? (
                <Text style={styles.elderMeta}>
                  Stock {stock.delta} {dose.doseUnit}
                </Text>
              ) : null}
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

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
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
      ...cardSurface(colors, elevation, gradients),
      alignItems: 'center',
      flex: 1,
      gap: spacing.xs,
      paddingVertical: spacing.md,
    },
    tileValue: {
      color: colors.text,
      fontSize: fontSize.title,
      fontWeight: '700',
      lineHeight: lineHeight.title,
    },
    tileLabel: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
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
}
