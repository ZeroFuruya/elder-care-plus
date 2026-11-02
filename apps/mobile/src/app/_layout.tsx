import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLockProvider } from '@/auth/app-lock';
import { AuthProvider } from '@/auth/auth-context';
import { AppLockScreen } from '@/components/app-lock-screen';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppLockProvider>
          {/* `auto` lets the status-bar glyphs follow the theme, which is why it flips in step with
              `app.json` `userInterfaceStyle: "automatic"` (docs/02-ui-ux-standard.md decision D1,
              closed 2026-09-30 once every screen resolved its palette from `useAppTheme()`). */}
          <View style={{ flex: 1 }}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
            {/* Above the router on purpose: a lock screen the navigator could cover is not a lock. */}
            <AppLockScreen />
          </View>
        </AppLockProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
