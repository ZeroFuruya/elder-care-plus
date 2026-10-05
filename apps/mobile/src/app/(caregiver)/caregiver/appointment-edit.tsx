import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { AppointmentForm, appointmentFormInitial } from '@/components/appointment-form';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { useSessionUser } from '@/auth/auth-context';
import { getAppointment, getLinkedElder, type Appointment } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * `C-07` Add / Edit Appointment (docs/specs/sprint-7.md). One route serves both: no `id` creates a
 * new appointment for the linked older adult; an `id` seeds the form from the stored record.
 */

interface EditData {
  elderId: string;
  existing: Appointment | null;
}

export default function C07EditAppointment() {
  const user = useSessionUser();
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = typeof id === 'string' ? id : '';

  const loader = useCallback(async (): Promise<EditData | null> => {
    if (appointmentId.length > 0) {
      const existing = await getAppointment(appointmentId);
      return existing ? { elderId: existing.elderId, existing } : null;
    }
    const link = await getLinkedElder(user.id);
    return link ? { elderId: link.elderId, existing: null } : null;
  }, [appointmentId, user.id]);

  const { state, reload } = useAsyncData(loader);

  const isEdit = appointmentId.length > 0;
  const title = isEdit ? 'Edit appointment' : 'New appointment';

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return <ScreenError title={title} showBack message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title={title} showBack safeBottom>
        <EmptyState
          title={isEdit ? 'Appointment not found' : 'No older adult linked yet'}
          description={
            isEdit
              ? 'It may have been removed. Go back and try again.'
              : 'Link an older adult before scheduling a visit.'
          }
        />
      </Screen>
    );
  }

  return (
    <Screen title={title} showBack safeBottom>
      <AppointmentForm
        elderId={state.data.elderId}
        initial={appointmentFormInitial(state.data.existing)}
        existing={state.data.existing}
        submitLabel={isEdit ? 'Save appointment' : 'Create appointment'}
        onSaved={() => router.back()}
      />
    </Screen>
  );
}
