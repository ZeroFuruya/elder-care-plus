import { router } from 'expo-router';
import { useCallback } from 'react';

import { useSessionUser } from '@/auth/auth-context';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { MedicationForm } from '@/components/medication-form';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { getLinkedElder, getMedicationPlan, type Medication } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * `C-03` Add Medication (docs/specs/sprint-3.md). The screen title and the submit label come from
 * the approved `C-03` wireframe; the form itself is shared with the edit route.
 */

interface FormData {
  elderId: string;
  existing: Medication[];
}

export default function C03AddMedication() {
  const user = useSessionUser();

  const loader = useCallback(async (): Promise<FormData | null> => {
    const link = await getLinkedElder(user.id);
    if (!link) return null;
    const plan = await getMedicationPlan(link.elderId);
    return { elderId: link.elderId, existing: plan.medications };
  }, [user.id]);

  const { state, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return <ScreenError title="Add medication" showBack message={state.message} onRetry={reload} />;
  }

  if (state.data === null) {
    return (
      <Screen title="Add medication" showBack safeBottom>
        <EmptyState title="No linked older adult" description="Link with older adult first." />
      </Screen>
    );
  }

  return (
    <Screen title="Add medication" showBack safeBottom>
      <MedicationForm
        elderId={state.data.elderId}
        initial={null}
        existing={state.data.existing}
        submitLabel="Save medication"
        onSaved={(medicationId) => router.replace(`/caregiver/med?id=${medicationId}`)}
      />
    </Screen>
  );
}
