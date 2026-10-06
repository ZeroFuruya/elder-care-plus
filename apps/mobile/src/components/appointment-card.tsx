import {
  appointmentDisplayState,
  appointmentStatePresentation,
  appointmentTypePresentation,
} from '@eldercare/shared';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import type { Appointment } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatInstantInZone } from '@/lib/format';

interface AppointmentCardProps {
  appointment: Appointment;
  onPress: () => void;
}

/**
 * One appointment as a tappable card (`C-06`/`E-05` lists and the dashboards).
 *
 * The display state is derived, so a past unresolved appointment shows the Overdue badge while
 * staying in the Upcoming list (owner decision 2026-10-06). The type and state each carry an icon
 * *and* a text label, never colour alone (docs/02-ui-ux-standard.md section 6).
 */
export function AppointmentCard({ appointment, onPress }: AppointmentCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const state = appointmentDisplayState(appointment.state, appointment.startAt);
  const statePresentation = appointmentStatePresentation[state];
  const typePresentation = appointmentTypePresentation[appointment.appointmentType];
  const when = formatInstantInZone(appointment.startAt, appointment.timezone);
  const where =
    appointment.appointmentType === 'visit'
      ? [appointment.facility, appointment.location].filter(Boolean).join(' · ')
      : [appointment.address].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${appointment.title}, ${typePresentation.label}, ${statePresentation.label}, ${when}`}
      accessibilityHint="Opens the appointment"
      onPress={onPress}
      android_ripple={{ color: colors.border }}
    >
      <Card>
        <View style={styles.top}>
          <Icon name={typePresentation.icon} size={20} color={colors.textMuted} />
          <Text style={styles.title}>{appointment.title}</Text>
          <StatusPill presentation={statePresentation} />
        </View>
        <Text style={styles.meta}>{typePresentation.label}</Text>
        <Text style={styles.meta}>{when}</Text>
        {where ? <Text style={styles.meta}>{where}</Text> : null}
      </Card>
    </Pressable>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    top: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    title: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
