import {
  hasUsableActiveBatch,
  stockDisplayFromBatch,
  stockDisplayPresentation,
} from '@eldercare/shared';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { DetailRow } from '@/components/detail-row';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { getMedicationDetail, type MedicationDetail, type MedicineBatch } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateWithYear, formatDaysOfWeek, formatTime } from '@/lib/format';

/**
 * `F-06` Family Medicine Detail (docs/specs/sprint-8.md).
 *
 * A read-only copy of `C-04`: the family member inspects one caregiver-entered medicine but has
 * no edit, activate, stock or batch control. The permission boundary is deliberate.
 */
export default function FamilyMedicineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicationId = typeof id === 'string' ? id : '';
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(async (): Promise<MedicationDetail | null> => {
    if (medicationId.length === 0) return null;
    return getMedicationDetail(medicationId);
  }, [medicationId]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return <ScreenError title="Medicine" showBack message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Medicine" showBack safeBottom>
        <EmptyState
          title="Medicine not found"
          description="It may have been removed. Go back and try again."
        />
      </Screen>
    );
  }

  const { medication, schedules, batches } = state.data;
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);

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
    <Screen title="Medicine" showBack safeBottom onRefresh={reload} refreshing={refreshing}>
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
      </Card>

      <Card title="Instructions">
        <Text style={styles.body}>{medication.instructions}</Text>
      </Card>

      <Card title="Schedule">
        {activeSchedules.length === 0 ? (
          <Text style={styles.meta}>No active schedule.</Text>
        ) : (
          activeSchedules.map((schedule) => (
            <View key={schedule.id} style={styles.scheduleRow}>
              <Text style={styles.scheduleTime}>{formatTime(schedule.timeOfDay)}</Text>
              <Text style={styles.body}>{formatDaysOfWeek(schedule.daysOfWeek)}</Text>
              <Text style={styles.meta}>
                {medication.doseQuantity} {medication.doseUnit}
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
            </View>
          ))
        )}
      </Card>

      <Text style={styles.meta}>
        Read-only. Only the older adult and their caregiver can change this.
      </Text>
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
