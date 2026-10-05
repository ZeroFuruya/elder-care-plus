import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { AppointmentCard } from '@/components/appointment-card';
import { ChoiceChips, type ChoiceOption } from '@/components/choice-chips';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { spacing, type AppThemeColors } from '@/constants/theme';
import { listAppointments, splitAppointments, type Appointment } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

type Tab = 'upcoming' | 'past';

const TAB_OPTIONS: ChoiceOption<Tab>[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

/**
 * `E-05` Elder Calendar (docs/specs/sprint-7.md). The older adult's read-only view of the same
 * records the caregiver manages. They cannot create, edit, complete or cancel an appointment.
 */
export default function ElderCalendarScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('upcoming');

  const loader = useCallback((): Promise<Appointment[]> => listAppointments(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading appointments…" />;
  if (state.status === 'error') {
    return <ScreenError title="Calendar" message={state.message} onRetry={reload} />;
  }

  const { upcoming, past } = splitAppointments(state.data);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <Screen title="Calendar" subtitle="Appointments" onRefresh={reload} refreshing={refreshing}>
      {state.data.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="Clinic visits and home visits will be listed here with their date and time."
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
                    ? 'No visit is scheduled ahead.'
                    : 'Completed and cancelled visits appear here.'
                }
              />
            ) : (
              shown.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onPress={() => router.push(`/elder/appointment?id=${appointment.id}`)}
                />
              ))
            )}
          </View>
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
