import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { MedicationForm, type MedicationFormInitial } from '@/components/medication-form';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { getMedicationDetail, listMedications, type Medication } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * `C-03` Edit Medication (docs/specs/sprint-3.md). Same form as the add route, seeded with the
 * stored plan; the wireframe's `Edit` action on `C-04` lands here.
 */

interface EditData {
  initial: MedicationFormInitial;
  existing: Medication[];
}

export default function C03EditMedication() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicationId = typeof id === 'string' ? id : '';

  const loader = useCallback(async (): Promise<EditData | null> => {
    if (medicationId.length === 0) return null;
    const detail = await getMedicationDetail(medicationId);
    if (!detail) return null;
    const existing = await listMedications(detail.medication.elderId);
    return {
      initial: {
        medication: detail.medication,
        schedules: detail.schedules,
        batches: detail.batches,
      },
      existing,
    };
  }, [medicationId]);

  const { state, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading…" />;
  if (state.status === 'error') {
    return (
      <ScreenError title="Edit medication" showBack message={state.message} onRetry={reload} />
    );
  }

  if (state.data === null) {
    return (
      <Screen title="Edit medication" showBack safeBottom>
        <EmptyState
          title="Medication not found"
          description="It may have been removed. Go back and try again."
        />
      </Screen>
    );
  }

  return (
    <Screen title="Edit medication" showBack safeBottom>
      <MedicationForm
        elderId={state.data.initial.medication.elderId}
        initial={state.data.initial}
        existing={state.data.existing}
        submitLabel="Save medication"
        onSaved={() => router.back()}
      />
    </Screen>
  );
}
