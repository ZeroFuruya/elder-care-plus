import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusBadge } from '@/components/status-badge';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import {
  countQueuedConfirmations,
  ensureDoseEvents,
  flushDoseOutbox,
  getDoseById,
  markDoseTaken,
  type ConfirmOutcome,
  type DoseView,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatTime } from '@/lib/format';

/**
 * `E-03` Dose Detail and, once the confirmation succeeds, `E-04` Confirmed.
 *
 * The only action is `Mark as taken`, a 56 dp target shown while the dose is
 * `due`. It is disabled synchronously on press, and the server's conditional
 * update is the real guard, so a double tap can never create a second record. A
 * confirmation made offline shows `Pending sync` and the duplicate-prevention
 * copy (`V-03`).
 */

interface DoseData {
  dose: DoseView | null;
  pending: number;
}

export default function ElderDoseScreen() {
  const user = useSessionUser();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const loader = useCallback(async (): Promise<DoseData> => {
    await flushDoseOutbox().catch(() => undefined);
    if (!id) return { dose: null, pending: await countQueuedConfirmations() };

    await ensureDoseEvents(user.id).catch(() => undefined);
    const [dose, pending] = await Promise.all([getDoseById(id), countQueuedConfirmations()]);
    return { dose, pending };
  }, [id, user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  const confirm = useCallback(async () => {
    if (!id || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      setOutcome(await markDoseTaken(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the confirmation.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [id]);

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

  const { dose, pending } = state.data;

  if (!dose) {
    return (
      <Screen title="Dose" showBack safeBottom>
        <EmptyState
          title="This dose is no longer available"
          description="It may have been removed when the medicine plan changed. Pull to refresh the list."
        />
        <Button label="Back to today" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const isTaken = outcome?.status === 'taken' || dose.status === 'taken';
  const isMissed = !isTaken && (outcome?.status === 'missed' || dose.status === 'missed');
  const queued = outcome?.queued === true || dose.syncState === 'pending' || pending > 0;
  const takenAt = outcome?.takenAt ?? dose.takenAt;
  const showAction = !isTaken && !isMissed && dose.status === 'due';

  return (
    <Screen
      title={isTaken ? 'Confirmed' : 'Dose'}
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      {queued ? (
        <Banner
          tone="info"
          message="Pending sync. Do not tap again. ElderCare+ prevents duplicate dose events."
        />
      ) : null}
      {error ? <Banner tone="error" message={error} /> : null}

      <Card>
        <View style={styles.row}>
          <Text style={styles.medicine}>
            {dose.medicine} {dose.strength}
          </Text>
          <StatusBadge status={isTaken ? 'taken' : dose.status} />
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

        {isTaken && takenAt ? (
          <View style={styles.metaRow}>
            <Icon name="check" size={14} color={colors.success} />
            <Text style={[styles.meta, styles.successText]}>Taken at {formatTime(takenAt)}</Text>
          </View>
        ) : null}

        {isMissed ? (
          <View style={styles.metaRow}>
            <Icon name="alert-triangle" size={14} color={colors.danger} />
            <Text style={[styles.meta, styles.dangerText]}>
              Missed{dose.missedAt ? ` at ${formatTime(dose.missedAt)}` : ''}
            </Text>
          </View>
        ) : null}
      </Card>

      {isTaken ? (
        <Card title="Confirmed">
          <Text style={styles.body}>This action cannot create a duplicate confirmation.</Text>
        </Card>
      ) : null}

      {isMissed ? (
        <Card title="Missed dose">
          <Text style={styles.body}>
            ElderCare+ does not advise whether a late dose should be taken.
          </Text>
        </Card>
      ) : null}

      {showAction ? (
        <Button
          label="Mark as taken"
          size="large"
          loading={submitting}
          disabled={submitting}
          onPress={() => void confirm()}
          accessibilityLabel={`Mark as taken, ${dose.medicine} ${dose.strength}, ${formatTime(dose.scheduledAt)}`}
          accessibilityHint="Records the confirmation time and shares it with the family caregiver"
        />
      ) : null}

      {isTaken ? <Button label="Done" variant="secondary" onPress={() => router.back()} /> : null}
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
  });
}
