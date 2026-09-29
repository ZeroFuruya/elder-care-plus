import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* `auto` lets the status-bar glyphs follow the theme, which is why it flips in step with
            `app.json` `userInterfaceStyle: "automatic"` (docs/02-ui-ux-standard.md decision D1,
            closed 2026-09-30 once every screen resolved its palette from `useAppTheme()`). */}
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
