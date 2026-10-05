import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  hasUsableActiveBatch,
  stockDisplayPresentation,
  stockDisplayFromBatch,
} from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
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
import { activeBatchOf, getMedicationPlan, schedulesOf, type MedicationPlan } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDaysOfWeek, formatTime } from '@/lib/format';

/**
 * `C-02` Medication List, elder view (docs/specs/sprint-3.md).
 *
 * The same plan the caregiver sees, read-only: the elder reads their own rows under RLS and the
 * screen offers no edit affordance. A medicine is shown with the dose, its schedule and the stock
 * state, and nothing here is ever generated or suggested by the application
 * (docs/00-product-flow.md, hard rules).
 */
export default function ElderMedsScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const loader = useCallback(() => getMedicationPlan(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your medicines…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Meds">
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const plan: MedicationPlan = state.data;
  const active = plan.medications.filter((medication) => medication.isActive);

  return (
    <Screen title="Meds" subtitle="What you take" onRefresh={reload} refreshing={refreshing}>
      {active.length === 0 ? (
        <EmptyState
          title="No medicines yet"
          description="Your family caregiver adds medicines and schedules here."
        />
      ) : (
        active.map((medication) => {
          const batch = activeBatchOf(plan.batches, medication.id);
          const hasAnyBatch = plan.batches.some(
            (candidate) => candidate.medicationId === medication.id,
          );
          const schedules = schedulesOf(plan.schedules, medication.id).filter(
            (schedule) => schedule.isActive,
          );

          return (
            <View key={medication.id} style={styles.card}>
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
            </View>
          );
        })
      )}

      <Text style={styles.note}>
        This list is read-only. It is never changed by an automatic process, and no advice about
        medicines is generated here.
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
