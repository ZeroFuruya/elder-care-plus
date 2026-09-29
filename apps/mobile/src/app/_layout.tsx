import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* Dark status-bar glyphs for the light app background. Dark-mode tokens exist
            (docs/02-ui-ux-standard.md §5.3) but the screens have not migrated yet, so the app
            stays pinned to light (app.json `userInterfaceStyle`). Flip both to automatic when
            the migration completes — decision D1. */}
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
