import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { AppointmentCard } from '@/components/appointment-card';
import { Button } from '@/components/button';
import { ChoiceChips, type ChoiceOption } from '@/components/choice-chips';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { spacing, type AppThemeColors } from '@/constants/theme';
import {
  getLinkedElder,
  listAppointments,
  splitAppointments,
  type Appointment,
  type MyLink,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

type Tab = 'upcoming' | 'past';

const TAB_OPTIONS: ChoiceOption<Tab>[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

interface CalendarData {
  link: MyLink | null;
  appointments: Appointment[];
}

/**
 * `C-06` Appointment List (docs/specs/sprint-7.md).
 *
 * The caregiver's view of the linked older adult's visits. The Upcoming tab holds every unresolved
 * appointment — a past one shows the Overdue badge rather than moving to Past (owner decision
 * 2026-10-06); Past holds completed and cancelled visits.
 */
export default function CaregiverCalendarScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('upcoming');

  const loader = useCallback(async (): Promise<CalendarData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { link: null, appointments: [] };
    return { link, appointments: await listAppointments(link.elderId) };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading appointments…" />;
  if (state.status === 'error') {
    return <ScreenError title="Calendar" message={state.message} onRetry={reload} />;
  }

  const { link, appointments } = state.data;
  const { upcoming, past } = splitAppointments(appointments);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <Screen title="Calendar" subtitle="Appointments" onRefresh={reload} refreshing={refreshing}>
      {!link ? (
        <EmptyState
          title="No older adult linked yet"
          description="Link an older adult with a six-digit code to schedule their visits."
        />
      ) : (
        <>
          <Button
            label="Add appointment"
            onPress={() => router.push('/caregiver/appointment-edit')}
            accessibilityHint="Opens the new appointment form"
          />

          {appointments.length === 0 ? (
            <EmptyState
              title="No appointments yet"
              description="Clinic and home visits for the linked older adult will appear here."
            />
          ) : (
            <>
              <ChoiceChips label="Show" options={TAB_OPTIONS} value={tab} onChange={setTab} />

              <View style={styles.list}>
                {shown.length === 0 ? (
                  <EmptyState
                    title={tab === 'upcoming' ? 'Nothing upcoming' : 'No past appointments'}
                    description={
                      tab === 'upcoming'
                        ? 'No visit is scheduled ahead. Add one whenever it is arranged.'
                        : 'Completed and cancelled visits appear here.'
                    }
                  />
                ) : (
                  shown.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      onPress={() => router.push(`/caregiver/appointment?id=${appointment.id}`)}
                    />
                  ))
                )}
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    list: {
      gap: spacing.sm,
    },
  });
}
