import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusBadge } from '@/components/status-badge';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { getDoseById, getDoseStockOutcome, type DoseStockOutcome, type DoseView } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatTime } from '@/lib/format';

/**
 * `C-05` Dose Detail for the caregiver: read-only. A missed dose is the reason
 * this screen exists, and it never offers to change history — the copy says so
 * (docs/specs/sprint-4.md). The stock outcome of a confirmation is shown when the
 * ledger has one.
 */

interface DoseData {
  dose: DoseView | null;
  stock: DoseStockOutcome | null;
}

export default function CaregiverDoseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(async (): Promise<DoseData> => {
    if (!id) return { dose: null, stock: null };
    const dose = await getDoseById(id);
    const stock = dose ? await getDoseStockOutcome(dose.id) : null;
    return { dose, stock };
  }, [id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading the dose…" />;
  if (state.status === 'error') {
    return (
      <ScreenError
        title="Dose"
        showBack
        safeBottom
        message={state.message}
        onRetry={() => void reload()}
      />
    );
  }

  const { dose, stock } = state.data;

  if (!dose) {
    return (
      <Screen title="Dose" showBack safeBottom>
        <EmptyState
          title="This dose is no longer available"
          description="It may have been removed when the medicine plan changed."
        />
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Dose"
      subtitle="Read-only"
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card>
        <View style={styles.row}>
          <Text style={styles.medicine}>
            {dose.medicine} {dose.strength}
          </Text>
          <StatusBadge status={dose.status} />
        </View>

        {dose.instructions.length > 0 ? <Text style={styles.body}>{dose.instructions}</Text> : null}

        <View style={styles.metaRow}>
          <Icon name="clock" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>Scheduled for {formatTime(dose.scheduledAt)}</Text>
        </View>

        <View style={styles.metaRow}>
          <Icon name="medication" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>
            {dose.doseQuantity} {dose.doseUnit}
          </Text>
        </View>

        {dose.takenAt ? (
          <View style={styles.metaRow}>
            <Icon name="check" size={14} color={colors.success} />
            <Text style={[styles.meta, styles.successText]}>
              Taken at {formatTime(dose.takenAt)}
            </Text>
          </View>
        ) : null}

        {dose.missedAt ? (
          <View style={styles.metaRow}>
            <Icon name="alert-triangle" size={14} color={colors.danger} />
            <Text style={[styles.meta, styles.dangerText]}>
              Missed at {formatTime(dose.missedAt)}
            </Text>
          </View>
        ) : null}

        {stock ? (
          <View style={styles.metaRow}>
            <Icon name="cube" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>
              Stock {stock.delta} {dose.doseUnit}
            </Text>
          </View>
        ) : null}
      </Card>

      {dose.status === 'missed' ? (
        <Card title="Missed dose">
          <Text style={styles.body}>
            ElderCare+ does not advise whether a late dose should be taken.
          </Text>
        </Card>
      ) : null}

      <Text style={styles.note}>
        Only the older adult records a confirmation. This view never changes the record.
      </Text>
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
    },
    medicine: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.heading,
      fontWeight: '700',
      lineHeight: lineHeight.heading,
    },
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    metaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    successText: {
      color: colors.success,
      fontWeight: '600',
    },
    dangerText: {
      color: colors.danger,
      fontWeight: '600',
    },
    note: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
