import { ScreenScaffold } from '@/components/screen-scaffold';

/** Prescriptions: create/verify/archive records and review evidence (Flow E). */
export default function CaregiverPrescriptionsScreen() {
  return (
    <ScreenScaffold
      title="Prescriptions"
      description="Prescription records, evidence review and caregiver verification. OCR output is reference-only."
    />
  );
}
