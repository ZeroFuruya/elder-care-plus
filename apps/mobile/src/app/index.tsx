import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';

/**
 * Entry gate. Nothing is routed on client state alone: the session comes from the local
 * database through `AuthProvider`, and the role decides which shell is opened.
 */
export default function Index() {
  const { ready, startupError, user } = useAuth();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;

  if (startupError) {
    return (
      <Screen title="ElderCare+">
        <Banner tone="error" message={startupError} />
      </Screen>
    );
  }

  if (!user) return <Redirect href="/welcome" />;
  return <Redirect href={user.role === 'elder' ? '/elder' : '/caregiver'} />;
}
