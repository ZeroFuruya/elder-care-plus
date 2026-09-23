import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Caregiver profile: elder profile and emergency numbers editors, link management
 * (consent / unlink require re-authentication), and account settings.
 */
export default function CaregiverProfileScreen() {
  return (
    <ScreenScaffold
      title="Profile"
      description="Elder profile, emergency numbers, care link and account settings."
    />
  );
}
