import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { homeRouteFor } from '@/auth/routes';
import type { AppIconName } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { TabIcon } from '@/components/tab-icon';
import { fontSize } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const TAB_ICONS: Record<string, AppIconName> = {
  index: 'home',
  meds: 'medication',
  calendar: 'calendar',
  emergency: 'stethoscope',
  profile: 'person',
};

function tabIcon(name: keyof typeof TAB_ICONS) {
  function TabIconFor({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <TabIcon name={TAB_ICONS[name]} color={color} focused={focused} />;
  }
  return TabIconFor;
}

/** Elder tabs: Home, Meds, Calendar, Emergency, Profile (docs/02-ui-ux-standard.md section 8). */
export default function ElderTabsLayout() {
  const { ready, user } = useAuth();
  const { colors } = useAppTheme();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;
  if (!user) return <Redirect href="/sign-in" />;
  if (user.role !== 'elder') return <Redirect href={homeRouteFor(user.role)} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.tabLabel },
        tabBarStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('index') }} />
      <Tabs.Screen name="meds" options={{ title: 'Meds', tabBarIcon: tabIcon('meds') }} />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen
        name="emergency"
        options={{ title: 'Emergency', tabBarIcon: tabIcon('emergency') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
      {/* Reachable from the home screen; hidden from the tab bar. */}
      <Tabs.Screen name="link" options={{ href: null }} />
      <Tabs.Screen name="circle" options={{ href: null }} />
      {/* Sprint 4 dose detail (`E-03`/`E-04`), pushed from the home list. */}
      <Tabs.Screen name="dose" options={{ href: null }} />
      {/* Sprint 7 appointment detail (`E-06`), pushed from the calendar. */}
      <Tabs.Screen name="appointment" options={{ href: null }} />
      {/* Sprint 8 ask-for-help (Flow F), pushed from the home screen. */}
      <Tabs.Screen name="help" options={{ href: null }} />
    </Tabs>
  );
}
