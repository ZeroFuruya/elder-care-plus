import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { homeRouteFor } from '@/auth/routes';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';

/**
 * Entry gate. The session comes from Supabase and the role is read from the
 * caller's own profile row — nothing routes on auth metadata or client state.
 */
export default function Index() {
  const { ready, startupError, user, retryStartup } = useAuth();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;

  if (startupError) {
    return (
      <Screen title="ElderCare+">
        <Banner tone="error" message={startupError} />
        <Button label="Try again" onPress={retryStartup} />
      </Screen>
    );
  }

  if (!user) return <Redirect href="/welcome" />;
  return <Redirect href={homeRouteFor(user.role)} />;
}
