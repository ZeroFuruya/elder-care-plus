import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Caregiver or elder. The choice is stored in `profiles.role` server-side and is
 * never trusted from client state (docs/00-product-flow.md section 7).
 */
export default function RoleSelectScreen() {
  return (
    <ScreenScaffold
      title="Who is using this device?"
      description="Choose caregiver or elder. One active caregiver-to-one-elder link in this release."
    />
  );
}
