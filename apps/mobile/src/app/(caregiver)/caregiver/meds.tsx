import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  hasUsableActiveBatch,
  stockStatusPresentation,
  stockStatusFromBatch,
} from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
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
  type Medication,
  type MedicationPlan,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDaysOfWeek, formatTime } from '@/lib/format';

/**
 * `C-02` Medication List (docs/specs/sprint-3.md).
 *
 * The caregiver's view of the linked older adult's plan. Title, `Active`/`Inactive` filter,
 * `Add medication`, the empty state heading and the footer note come from the approved `C-02`
 * wireframe; the per-card schedule and stock lines are the spec's field list (`name`,
 * strength/form, dose and stock state).
 *
 * The wireframe's `Next:` line needs dose generation, which is Sprint 4, so it is not drawn here -
 * a card never promises a next dose the database cannot yet produce.
 */

interface MedsData {
  elderName: string | null;
  plan: MedicationPlan;
}

/** The stock state to show for one medicine, derived from its active batch. */
function stockStateOf(plan: MedicationPlan, medication: Medication) {
  const batch = activeBatchOf(plan.batches, medication.id);
  const usable = hasUsableActiveBatch(batch, medication.doseUnit);
  return {
    presentation:
      stockStatusPresentation[
        stockStatusFromBatch(
          batch?.quantity ?? 0,
          batch?.lowStockThreshold,
          batch?.expiryDate,
          usable,
        )
      ],
    batch,
  };
}

export default function C02MedicationList() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );
  const [showInactive, setShowInactive] = useState(false);

  const loader = useCallback(async (): Promise<MedsData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { elderName: null, plan: { medications: [], schedules: [], batches: [] } };
    return { elderName: link.elderName, plan: await getMedicationPlan(link.elderId) };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading medicines…" />;
  if (state.status === 'error') {
    return <ScreenError title="Medications" message={state.message} onRetry={reload} />;
  }

  const { elderName, plan } = state.data;
  const shown = plan.medications.filter((medication) => medication.isActive !== showInactive);

  return (
    <Screen
      title="Medications"
      subtitle={elderName ? `Taken by ${elderName}` : 'No older adult linked'}
      onRefresh={reload}
      refreshing={refreshing}
    >
      <ChoiceChips
        label="Show"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        value={showInactive ? 'inactive' : 'active'}
        onChange={(value) => setShowInactive(value === 'inactive')}
      />

      <Button label="Add medication" onPress={() => router.push('/caregiver/med-new')} />

      {shown.length === 0 ? (
        <EmptyState
          title="No medicines yet"
          description="Add a medicine to start the older adult's plan."
        />
      ) : (
        shown.map((medication) => {
          const stock = stockStateOf(plan, medication);
          const schedules = schedulesOf(plan.schedules, medication.id).filter(
            (schedule) => schedule.isActive,
          );

          return (
            <Pressable
              key={medication.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${medication.name}`}
              onPress={() => router.push(`/caregiver/med?id=${medication.id}`)}
              android_ripple={{ color: colors.border }}
              style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
            >
              <View style={styles.top}>
                <Text style={styles.medicine}>{medication.name}</Text>
                <StatusPill
                  presentation={{
                    label: medication.isActive ? 'Active' : 'Inactive',
                    icon: medication.isActive ? 'check' : 'close',
                    tone: medication.isActive ? 'success' : 'neutral',
                  }}
                />
              </View>

              <Text style={styles.dose}>
                {medication.strength}
                {' - '}
                {medication.doseQuantity} {medication.doseUnit}
              </Text>

              <Text style={styles.instructions}>{medication.instructions}</Text>

              {medication.isActive && schedules.length > 0 ? (
                <Text style={styles.meta}>
                  {formatDaysOfWeek(schedules[0].daysOfWeek)} at{' '}
                  {formatTime(schedules[0].timeOfDay)}
                </Text>
              ) : null}

              {medication.isActive ? (
                <View style={styles.stockRow}>
                  <StatusPill presentation={stock.presentation} />
                  {stock.batch ? (
                    <Text style={styles.meta}>
                      {stock.batch.quantity} {stock.batch.unit}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}

      <Text style={styles.note}>
        Editing or deactivating affects future doses only. History remains available.
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
    cardPressed: {
      opacity: 0.9,
    },
    top: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    medicine: {
      color: colors.text,
      flex: 1,
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
    stockRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    note: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
