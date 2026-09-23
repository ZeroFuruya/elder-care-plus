import { ScreenScaffold } from '@/components/screen-scaffold';

/** Medicines list: add/edit medicine, batches, stock adjustments, needs-review state. */
export default function CaregiverMedicinesScreen() {
  return (
    <ScreenScaffold
      title="Medicines"
      description="Medicine plan, schedules, batches, expiry and stock adjustments (Flow B and D)."
    />
  );
}
