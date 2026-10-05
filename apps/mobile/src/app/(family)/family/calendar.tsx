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
import { getLinkedElder, listAppointments, splitAppointments, type Appointment } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

type Tab = 'upcoming' | 'past';

const TAB_OPTIONS: ChoiceOption<Tab>[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

/**
 * `F-07` Family Appointments (docs/specs/sprint-8.md). A family member sees the linked elder's
 * visits read-only to offer a ride or companionship. No create, edit, complete or cancel.
 */
export default function FamilyCalendarScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('upcoming');

  const loader = useCallback(async (): Promise<Appointment[] | null> => {
    const link = await getLinkedElder(user.id);
    if (!link) return null;
    return listAppointments(link.elderId);
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading appointments…" />;
  if (state.status === 'error') {
    return <ScreenError title="Visits" message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Visits" onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No record is shared with you"
          description="Ask your family caregiver for a six-digit invite code, then enter it on the Home tab."
        />
      </Screen>
    );
  }

  const { upcoming, past } = splitAppointments(state.data);
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <Screen title="Visits" subtitle="Read-only" onRefresh={reload} refreshing={refreshing}>
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
                  onPress={() => router.push(`/family/appointment?id=${appointment.id}`)}
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
