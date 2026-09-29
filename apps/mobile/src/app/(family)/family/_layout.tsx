import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { homeRouteFor } from '@/auth/routes';
import { LoadingScreen } from '@/components/loading-screen';

/** Family-member shell. Read-only by design (docs/adr/adr-001). */
export default function FamilyLayout() {
  const { ready, user } = useAuth();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;
  if (!user) return <Redirect href="/sign-in" />;
  if (user.role !== 'family_member') return <Redirect href={homeRouteFor(user.role)} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
