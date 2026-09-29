import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

/**
 * Emergency card. Real emergency details arrive with the elder profile sprint;
 * until then the screen says so instead of showing a synthetic stranger as
 * "me" (docs/specs/sprint-1b.md criterion 9).
 */
export default function ElderEmergencyScreen() {
  return (
    <Screen title="Emergency" subtitle="Show this to anyone helping you">
      <EmptyState
        title="Emergency details are not set up yet"
        description="Your name, blood type, conditions, allergies, doctor and emergency contact will appear here once they are added."
      />
    </Screen>
  );
}
