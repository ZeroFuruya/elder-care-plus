import {
  appointmentDisplayState,
  appointmentStatePresentation,
  appointmentTypePresentation,
} from '@eldercare/shared';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailRow } from '@/components/detail-row';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { getAppointment, type Appointment } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { addAppointmentToDeviceCalendar, calendarPermissionStatus } from '@/lib/device-calendar';
import { formatInstantInZone } from '@/lib/format';

/**
 * `E-06` Elder Appointment Detail (docs/specs/sprint-7.md). Read-only: the older adult sees where
 * and when to go, and who is coming for a home visit, but never a control that changes the record.
 */
export default function E06AppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = typeof id === 'string' ? id : '';
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [canExport, setCanExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  // Probe the permission without prompting, so the export control is only offered when it can work.
  useEffect(() => {
    let active = true;
    void (async () => {
      const status = await calendarPermissionStatus();
      if (active) setCanExport(status === 'granted' || status === 'undetermined');
    })();
    return () => {
      active = false;
    };
  }, []);

  const loader = useCallback(async (): Promise<Appointment | null> => {
    if (appointmentId.length === 0) return null;
    return getAppointment(appointmentId);
  }, [appointmentId]);

  const { state, refreshing, reload } = useAsyncData(loader);

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

  async function addToCalendar() {
    setExporting(true);
    setExportMessage(null);
    try {
      await addAppointmentToDeviceCalendar({
        title: appointment.title,
        startAt: appointment.startAt,
        timezone: appointment.timezone,
        location:
          appointment.appointmentType === 'visit'
            ? [appointment.facility, appointment.location].filter(Boolean).join(', ') || null
            : appointment.address,
        notes: appointment.notes,
      });
      setExportMessage({ tone: 'success', text: 'Added to your device calendar.' });
    } catch (cause) {
      setExportMessage({
        tone: 'error',
        text:
          cause instanceof Error
            ? cause.message
            : 'Could not add the event to the device calendar.',
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen title="Appointment" showBack safeBottom onRefresh={reload} refreshing={refreshing}>
      <Card>
        <View style={styles.heading}>
          <Text style={styles.title}>{appointment.title}</Text>
          <StatusPill presentation={statePresentation} />
        </View>
        <Text style={styles.meta}>{typePresentation.label}</Text>
        <Text style={styles.when}>
          {formatInstantInZone(appointment.startAt, appointment.timezone)}
        </Text>
      </Card>

      {appointment.appointmentType === 'visit' ? (
        <Card title="Where to go">
          <DetailRow label="Clinic or facility" value={appointment.facility} />
          <DetailRow label="Location" value={appointment.location} />
          <DetailRow label="Doctor or provider" value={appointment.provider} />
        </Card>
      ) : (
        <Card title="Who is coming">
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

      {exportMessage ? <Banner tone={exportMessage.tone} message={exportMessage.text} /> : null}

      {canExport ? (
        <Button
          label="Add to device calendar"
          variant="secondary"
          loading={exporting}
          onPress={() => void addToCalendar()}
          accessibilityHint="Adds this appointment to your phone's calendar"
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
