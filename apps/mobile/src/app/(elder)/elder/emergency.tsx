import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Emergency: verified identity, allergies, conditions, blood type, care
 * instructions, active medicines, doctor and ordered emergency numbers.
 * Tapping a number opens the device dialer — the app never calls or dispatches.
 */
export default function ElderEmergencyScreen() {
  return (
    <ScreenScaffold
      title="Emergency"
      description="Verified emergency information and ordered contacts. Tapping a number opens the device dialer for confirmation."
    />
  );
}
