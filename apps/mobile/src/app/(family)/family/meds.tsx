import {
  hasUsableActiveBatch,
  stockDisplayFromBatch,
  stockDisplayPresentation,
} from '@eldercare/shared';
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
import {
  activeBatchOf,
  getLinkedElder,
  getMedicationPlan,
  schedulesOf,
  type MedicationPlan,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDaysOfWeek, formatTime } from '@/lib/format';

/**
 * `F-05` Family Medication Schedule (docs/specs/sprint-8.md).
 *
 * The same plan the caregiver and elder see, read-only: the family member reads the linked
 * elder's rows under RLS and this screen offers no control. Tapping a medicine opens `F-06`.
 */
export default function FamilyMedsScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const loader = useCallback(async (): Promise<{ plan: MedicationPlan | null }> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { plan: null };
    return { plan: await getMedicationPlan(link.elderId) };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading the medicines…" />;
  if (state.status === 'error') {
    return <ScreenError title="Medicines" message={state.message} onRetry={reload} />;
  }

  const plan = state.data.plan;
  const active = (plan?.medications ?? []).filter((medication) => medication.isActive);

  return (
    <Screen title="Medicines" subtitle="Read-only" onRefresh={reload} refreshing={refreshing}>
      {active.length === 0 ? (
        <EmptyState
          title="No medicines to show"
          description="The family caregiver sets up each medicine and its schedule."
        />
      ) : (
        active.map((medication) => {
          const batch = activeBatchOf(plan?.batches ?? [], medication.id);
          const hasAnyBatch = (plan?.batches ?? []).some(
            (candidate) => candidate.medicationId === medication.id,
          );
          const schedules = schedulesOf(plan?.schedules ?? [], medication.id).filter(
            (schedule) => schedule.isActive,
          );

          return (
            <Pressable
              key={medication.id}
              accessibilityRole="button"
              accessibilityLabel={`${medication.name}, ${medication.strength}`}
              accessibilityHint="Opens the medicine details"
              onPress={() => router.push(`/family/med?id=${medication.id}`)}
              android_ripple={{ color: colors.border }}
            >
              <View style={styles.card}>
                <Text style={styles.medicine}>{medication.name}</Text>
                <Text style={styles.dose}>
                  {medication.strength}
                  {' - '}
                  {medication.doseQuantity} {medication.doseUnit}
                </Text>
                <Text style={styles.instructions}>{medication.instructions}</Text>

                {schedules.map((schedule) => (
                  <Text key={schedule.id} style={styles.meta}>
                    {formatDaysOfWeek(schedule.daysOfWeek)} at {formatTime(schedule.timeOfDay)}
                  </Text>
                ))}

                {hasAnyBatch ? (
                  <StatusPill
                    presentation={
                      stockDisplayPresentation[
                        stockDisplayFromBatch({
                          hasAnyBatch,
                          hasValidActiveBatch: hasUsableActiveBatch(batch, medication.doseUnit),
                          quantity: batch?.quantity ?? null,
                          lowStockThreshold: batch?.lowStockThreshold ?? null,
                          expiryDate: batch?.expiryDate ?? null,
                        })
                      ]
                    }
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}

      <Text style={styles.note}>
        This list is read-only. Only the older adult and their caregiver can change it.
      </Text>
    </Screen>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, elevation, gradients),
      gap: spacing.sm,
      padding: spacing.md,
    },
    medicine: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    dose: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '600',
      lineHeight: lineHeight.caption,
    },
    instructions: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    meta: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '600',
      lineHeight: lineHeight.caption,
    },
    note: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
