import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { homeRouteFor } from '@/auth/routes';

/** Auth shell: signed-in users are pushed to their own home, never left here. */
export default function AuthLayout() {
  const { ready, user } = useAuth();

  // Deep links and the back stack both pass through this layout; without the
  // guard a signed-in user could open a second sign-in and swap accounts.
  if (ready && user) return <Redirect href={homeRouteFor(user.role)} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
