import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Elder prescriptions: verified/current list and read-only evidence.
 * Expired/archived stay viewable with a clear status. An elder-submitted photo
 * stays `pending_review` and is never shown as verified.
 */
export default function ElderPrescriptionsScreen() {
  return (
    <ScreenScaffold
      title="Prescriptions"
      description="Verified prescriptions and read-only evidence. Submitted photos stay Pending review until the caregiver verifies them."
    />
  );
}
