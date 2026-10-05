import {
  appointmentDisplayState,
  appointmentReminderLabel,
  appointmentStatePresentation,
  appointmentTypePresentation,
} from '@eldercare/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { cancelAppointment, completeAppointment, getAppointment, type Appointment } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatInstantInZone, formatRelative } from '@/lib/format';

/**
 * `C-08` Appointment Detail (docs/specs/sprint-7.md).
 *
 * Read view of one appointment plus the caregiver's `Edit`, `Complete` and `Cancel` actions. Both
 * terminal actions confirm first and are refused by the RPC once the appointment has left
 * `upcoming`. A past unresolved appointment reads as Overdue.
 */
export default function C08AppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = typeof id === 'string' ? id : '';
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'complete' | 'cancel' | null>(null);

  const loader = useCallback(async (): Promise<Appointment | null> => {
    if (appointmentId.length === 0) return null;
    return getAppointment(appointmentId);
  }, [appointmentId]);

  const { state, refreshing, reload } = useAsyncData(loader);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      await reload();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return <ScreenError title="Appointment" showBack message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Appointment" showBack safeBottom>
        <EmptyState
          title="Appointment not found"
          description="It may have been removed. Go back and try again."
        />
      </Screen>
    );
  }

  const appointment = state.data;
  const displayState = appointmentDisplayState(appointment.state, appointment.startAt);
  const statePresentation = appointmentStatePresentation[displayState];
  const typePresentation = appointmentTypePresentation[appointment.appointmentType];
  const when = formatInstantInZone(appointment.startAt, appointment.timezone);
  const isUpcoming = appointment.state === 'upcoming';

  return (
    <Screen title="Appointment" showBack safeBottom onRefresh={reload} refreshing={refreshing}>
      {feedback ? <Banner tone="error" message={feedback} /> : null}

      <Card>
        <View style={styles.heading}>
          <Text style={styles.title}>{appointment.title}</Text>
          <StatusPill presentation={statePresentation} />
        </View>
        <Text style={styles.meta}>{typePresentation.label}</Text>
        <Text style={styles.when}>{when}</Text>
        {displayState === 'overdue' ? (
          <Text style={styles.meta}>
            This visit is in the past. Mark it completed or cancel it.
          </Text>
        ) : null}
        {isUpcoming ? (
          <Button
            label="Edit"
            variant="secondary"
            disabled={busy}
            onPress={() => router.push(`/caregiver/appointment-edit?id=${appointment.id}`)}
          />
        ) : null}
      </Card>

      {appointment.appointmentType === 'visit' ? (
        <Card title="Visit">
          <DetailRow label="Clinic or facility" value={appointment.facility} />
          <DetailRow label="Location" value={appointment.location} />
          <DetailRow label="Doctor or provider" value={appointment.provider} />
        </Card>
      ) : (
        <Card title="Home visit">
          <DetailRow label="Address" value={appointment.address} />
          <DetailRow label="Visitor or provider" value={appointment.provider} />
          <DetailRow label="Contact number" value={appointment.contactPhone} />
        </Card>
      )}

      {appointment.notes ? (
        <Card title="Notes">
          <Text style={styles.body}>{appointment.notes}</Text>
        </Card>
      ) : null}

      <Card title="Reminder">
        <DetailRow
          label="Lead time"
          value={appointmentReminderLabel(appointment.reminderLeadMinutes)}
        />
        <DetailRow label="Notify the older adult" value={appointment.notifyElder ? 'Yes' : 'No'} />
      </Card>

      {appointment.state === 'completed' ? (
        <Card title="Completed">
          <Text style={styles.meta}>
            {appointment.completedAt ? formatRelative(appointment.completedAt) : 'Completed'}
          </Text>
          {appointment.completionNote ? (
            <Text style={styles.body}>{appointment.completionNote}</Text>
          ) : null}
        </Card>
      ) : null}

      {appointment.state === 'cancelled' ? (
        <Card title="Cancelled">
          <Text style={styles.meta}>
            {appointment.cancelledAt ? formatRelative(appointment.cancelledAt) : 'Cancelled'}
          </Text>
          {appointment.cancelNote ? (
            <Text style={styles.body}>{appointment.cancelNote}</Text>
          ) : null}
        </Card>
      ) : null}

      {isUpcoming ? (
        <>
          <Button
            label="Mark as completed"
            disabled={busy}
            onPress={() => setConfirming('complete')}
          />
          <Button
            label="Cancel appointment"
            variant="danger"
            disabled={busy}
            onPress={() => setConfirming('cancel')}
          />
        </>
      ) : null}

      <ConfirmDialog
        visible={confirming === 'complete'}
        title="Mark as completed"
        description="Record that this visit happened. This cannot be undone."
        confirmLabel="Mark as completed"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          void run(() => completeAppointment(appointment.id), 'Could not complete the appointment.')
        }
      />

      <ConfirmDialog
        visible={confirming === 'cancel'}
        title="Cancel appointment"
        description="The visit is cancelled and moves to the Past list. This cannot be undone."
        confirmLabel="Cancel appointment"
        cancelLabel="Keep appointment"
        danger
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          void run(() => cancelAppointment(appointment.id), 'Could not cancel the appointment.')
        }
      />
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
    title: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.heading,
      fontWeight: '700',
      lineHeight: lineHeight.heading,
    },
    when: {
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
  });
}
