import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Welcome / intro. Must explain why notifications are requested before asking
 * for the permission (Flow A step 1).
 */
export default function AuthWelcomeScreen() {
  return (
    <ScreenScaffold
      title="Welcome"
      description="Intro copy, consent statement and the notification-permission explanation will live here."
    />
  );
}
