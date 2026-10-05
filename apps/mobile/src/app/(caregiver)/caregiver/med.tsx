import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  hasUsableActiveBatch,
  stockDisplayPresentation,
  stockDisplayFromBatch,
} from '@eldercare/shared';

import { AdjustStockDialog } from '@/components/adjust-stock-dialog';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DetailRow } from '@/components/detail-row';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  adjustStock,
  getMedicationDetail,
  setActiveBatch,
  setMedicationActive,
  type MedicationDetail,
  type MedicineBatch,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateWithYear, formatDaysOfWeek, formatTime } from '@/lib/format';

/**
 * `C-04` Medication Detail (docs/specs/sprint-3.md).
 *
 * Read view of one plan plus the caregiver's `Edit`, activate/deactivate and active-batch actions.
 * Titles, `Edit`, `INSTRUCTIONS`, `ACTIVE SCHEDULE`, `RECENT ADHERENCE` and `Deactivate medication`
 * come from the approved `C-04` wireframe. The dose list the wireframe shows under `RECENT
 * ADHERENCE` needs Sprint 4's `dose_events`, so this renders the documented partial state instead
 * of a fabricated history.
 */

const ADHERENCE_PARTIAL = 'Dose history is not shown here yet.';

export default function C04MedicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicationId = typeof id === 'string' ? id : '';
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const loader = useCallback(async (): Promise<MedicationDetail | null> => {
    if (medicationId.length === 0) return null;
    return getMedicationDetail(medicationId);
  }, [medicationId]);

  const { state, refreshing, reload } = useAsyncData(loader);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      await reload();
    } catch (cause: unknown) {
      setFeedback(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
      setConfirming(false);
      setAdjusting(false);
    }
  }

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return (
      <ScreenError title="Medication details" showBack message={state.message} onRetry={reload} />
    );
  }

  if (state.data === null) {
    return (
      <Screen title="Medication details" showBack safeBottom>
        <EmptyState
          title="Medication not found"
          description="It may have been removed. Go back and try again."
        />
      </Screen>
    );
  }

  const { medication, schedules, batches } = state.data;
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);
  const activeBatch = batches.find((batch) => batch.isActive) ?? null;

  function batchPresentation(batch: MedicineBatch) {
    return stockDisplayPresentation[
      stockDisplayFromBatch({
        hasAnyBatch: true,
        hasValidActiveBatch: hasUsableActiveBatch(batch, medication.doseUnit),
        quantity: batch.quantity,
        lowStockThreshold: batch.lowStockThreshold,
        expiryDate: batch.expiryDate,
      })
    ];
  }

  return (
    <Screen
      title="Medication details"
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      {feedback ? <Banner tone="error" message={feedback} /> : null}

      <Card>
        <View style={styles.heading}>
          <Text style={styles.name}>{medication.name}</Text>
          <StatusPill
            presentation={{
              label: medication.isActive ? 'Active' : 'Inactive',
              icon: medication.isActive ? 'check' : 'close',
              tone: medication.isActive ? 'success' : 'neutral',
            }}
          />
        </View>
        <Text style={styles.strength}>{medication.strength}</Text>
        <Text style={styles.meta}>
          Start: {formatDateWithYear(new Date(`${medication.startDate}T00:00:00`))}
          {' - '}
          {medication.endDate
            ? formatDateWithYear(new Date(`${medication.endDate}T00:00:00`))
            : 'No end date'}
        </Text>
        <Button
          label="Edit"
          variant="secondary"
          onPress={() => router.push(`/caregiver/med-edit?id=${medication.id}`)}
        />
      </Card>

      <Card title="Instructions">
        <Text style={styles.body}>{medication.instructions}</Text>
      </Card>

      <Card title="Active schedule">
        {activeSchedules.length === 0 ? (
          <Text style={styles.meta}>No active schedule. Add a schedule to activate the plan.</Text>
        ) : (
          activeSchedules.map((schedule) => (
            <View key={schedule.id} style={styles.scheduleRow}>
              <Text style={styles.scheduleTime}>{formatTime(schedule.timeOfDay)}</Text>
              <Text style={styles.body}>{formatDaysOfWeek(schedule.daysOfWeek)}</Text>
              <Text style={styles.meta}>
                {medication.doseQuantity} {medication.doseUnit}
                {' - '}
                {schedule.graceMinutes} min grace
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card title="Stock">
        {batches.length === 0 ? (
          <StatusPill presentation={stockDisplayPresentation.untracked} />
        ) : (
          batches.map((batch) => (
            <View key={batch.id} style={styles.batchRow}>
              <View style={styles.batchTop}>
                <StatusPill presentation={batchPresentation(batch)} />
                <Text style={styles.body}>
                  {batch.quantity} {batch.unit}
                </Text>
              </View>
              <DetailRow
                label="Expiry date"
                value={formatDateWithYear(new Date(`${batch.expiryDate}T00:00:00`))}
              />
              {batch.lotNumber ? <DetailRow label="Lot number" value={batch.lotNumber} /> : null}
              {batch.lowStockThreshold !== null ? (
                <DetailRow label="Low-stock threshold" value={`${batch.lowStockThreshold}`} />
              ) : null}
              {batch.refillContact ? (
                <DetailRow label="Refill contact" value={batch.refillContact} />
              ) : null}
              {batch.isActive ? (
                <Button
                  label="Adjust stock"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => setAdjusting(true)}
                />
              ) : null}
              {!batch.isActive && batch !== activeBatch ? (
                <Button
                  label="Set as active"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    void run(() => setActiveBatch(batch.id), 'Could not change the stock batch.')
                  }
                />
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Card title="Recent adherence">
        <Text style={styles.meta}>{ADHERENCE_PARTIAL}</Text>
      </Card>

      {medication.isActive ? (
        <Button
          label="Deactivate medication"
          variant="danger"
          disabled={busy}
          onPress={() => setConfirming(true)}
        />
      ) : (
        <Button
          label="Activate medication"
          disabled={busy}
          onPress={() =>
            void run(
              () => setMedicationActive(medication.id, true),
              'Could not change the medication.',
            )
          }
        />
      )}

      <ConfirmDialog
        visible={confirming}
        title="Deactivate medication"
        description="Future doses stop. The medicine and its history stay in the plan."
        confirmLabel="Deactivate medication"
        danger
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          void run(
            () => setMedicationActive(medication.id, false),
            'Could not change the medication.',
          )
        }
      />

      {adjusting && activeBatch !== null ? (
        <AdjustStockDialog
          medicationName={medication.name}
          unit={activeBatch.unit}
          currentQuantity={activeBatch.quantity}
          busy={busy}
          onCancel={() => setAdjusting(false)}
          onSubmit={(delta, reason, note) => {
            void run(
              () => adjustStock(activeBatch.id, delta, reason, note.length > 0 ? note : undefined),
              'Could not adjust the stock.',
            );
          }}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    heading: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    name: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.heading,
      fontWeight: '700',
      lineHeight: lineHeight.heading,
    },
    strength: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
    },
    body: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    scheduleRow: {
      gap: spacing.xs,
    },
    scheduleTime: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    batchRow: {
      gap: spacing.sm,
    },
    batchTop: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
  });
}
