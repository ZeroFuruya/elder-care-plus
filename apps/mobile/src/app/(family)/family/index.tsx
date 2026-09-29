import { medicationFormLabels } from '@eldercare/shared';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DeactivateAccount } from '@/components/deactivate-account';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  ensureDoseEvents,
  getMedicationPlan,
  listDoses,
  listMyLinks,
  summarise,
  type AdherenceSummary,
  type DoseView,
  type MedicationPlan,
  type MyLink,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import {
  addDays,
  endOfDay,
  formatDateWithYear,
  formatDaysOfWeek,
  formatTime,
  parseDayOnly,
  startOfDay,
} from '@/lib/format';

/**
 * Connected family member: read-only view of the linked elder's medication plan
 * and recent adherence (docs/specs/sprint-4.md; full plan visibility is the
 * owner's 2026-09-30 decision). It renders **no control** — the plan and the dose
 * record are read through the same care-link-scoped RLS policy a manager reads,
 * and the family member holds no write grant.
 */

interface FamilyData {
  links: MyLink[];
  plan: MedicationPlan | null;
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
    if (!active) return { links, plan: null, doses: [], summary: EMPTY_SUMMARY };

    await ensureDoseEvents(active.elderId).catch(() => undefined);
    const now = new Date();
    const [plan, doses] = await Promise.all([
      getMedicationPlan(active.elderId),
      listDoses(active.elderId, { from: startOfDay(addDays(now, -6)), to: endOfDay(now), now }),
    ]);
    return { links, plan, doses, summary: summarise(doses) };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your record…" />;
  if (state.status === 'error') {
    return <ScreenError title="Family view" message={state.message} onRetry={reload} safeBottom />;
  }

  const { links, plan, doses, summary } = state.data;
  const active = links.find((link) => link.status === 'active') ?? null;
  const invited = links.find((link) => link.status === 'invited') ?? null;
  const wasRevoked = !active && !invited && links.some((link) => link.status === 'revoked');

  if (active) {
    const medications = plan?.medications ?? [];

    return (
      <Screen
        title="Family view"
        subtitle="Read-only access"
        onRefresh={reload}
        refreshing={refreshing}
        safeBottom
      >
        <Card title="You can see">
          <Text style={styles.name}>{active.elderName ?? 'Your older adult'}</Text>
          <Text style={styles.body}>
            Read-only access: only the older adult and their caregiver can change anything.
          </Text>
        </Card>

        <Card title="Medication plan">
          {medications.length === 0 ? (
            <EmptyState
              title="No medicines on the plan"
              description="The family caregiver sets up each medicine and its schedule."
            />
          ) : (
            medications.map((medication) => {
              const schedules = (plan?.schedules ?? []).filter(
                (schedule) => schedule.medicationId === medication.id,
              );
              const batches = (plan?.batches ?? []).filter(
                (batch) => batch.medicationId === medication.id,
              );
              return (
                <View key={medication.id} style={styles.planRow}>
                  <Text style={styles.medicine}>
                    {medication.name} {medication.strength}
                  </Text>
                  <Text style={styles.body}>
                    {medication.doseQuantity} {medication.doseUnit}
                    {medication.form ? ` · ${medicationFormLabels[medication.form]}` : ''}
                  </Text>
                  {medication.instructions.length > 0 ? (
                    <Text style={styles.body}>{medication.instructions}</Text>
                  ) : null}
                  {schedules.map((schedule) => (
                    <Text key={schedule.id} style={styles.body}>
                      {formatTime(schedule.timeOfDay)} · {formatDaysOfWeek(schedule.daysOfWeek)}
                    </Text>
                  ))}
                  {batches.map((batch) => (
                    <Text key={batch.id} style={styles.body}>
                      Stock {batch.quantity} {batch.unit} · expires{' '}
                      {formatDateWithYear(parseDayOnly(batch.expiryDate))}
                    </Text>
                  ))}
                </View>
              );
            })
          )}
        </Card>

        <Card title="Dose activity">
          <Text style={styles.body}>
            {summary.taken} taken · {summary.missed} missed · {summary.due} due · {summary.upcoming}{' '}
            upcoming
          </Text>
        </Card>

        {doses.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Confirmed doses appear here as the older adult records them."
          />
        ) : (
          doses.map((dose) => <DoseCard key={dose.id} dose={dose} />)
        )}

        <DeactivateAccount />

        <LogoutButton size="large" />
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
        safeBottom
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
    <Screen title="Family view" onRefresh={reload} refreshing={refreshing} safeBottom>
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
    medicine: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    planRow: {
      gap: spacing.xs,
      paddingBottom: spacing.sm,
    },
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
