import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { homeRouteFor } from '@/auth/routes';
import type { AppIconName } from '@/components/icon';
import { LoadingScreen } from '@/components/loading-screen';
import { TabIcon } from '@/components/tab-icon';
import { fontSize } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useHelpRequestNotifications } from '@/hooks/use-help-notifications';

const TAB_ICONS: Record<string, AppIconName> = {
  index: 'home',
  meds: 'medication',
  calendar: 'calendar',
  help: 'help',
  more: 'person',
};

function tabIcon(name: keyof typeof TAB_ICONS) {
  function TabIconFor({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <TabIcon name={TAB_ICONS[name]} color={color} focused={focused} />;
  }
  return TabIconFor;
}

/**
 * Connected family member tabs: Home, Meds, Visits, Help, More
 * (docs/specs/sprint-8.md; the read-only permission boundary is docs/adr/adr-001).
 *
 * Everything reachable here is read-only apart from two deliberate exceptions: accepting or
 * completing a help request, and setting one's own availability. The detail routes
 * (`med`, `appointment`, `elder`, `emergency`, `circle`, `availability`, `help-detail`) and the
 * pre-consent join flow (`link`) are registered with `href: null` so they never appear in the
 * tab bar but can still be pushed.
 */
export default function FamilyTabsLayout() {
  const { ready, user } = useAuth();
  const { colors } = useAppTheme();

  // Mirrors help-request events to the device while the family member uses the app (OD4).
  useHelpRequestNotifications();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;
  if (!user) return <Redirect href="/sign-in" />;
  if (user.role !== 'family_member') return <Redirect href={homeRouteFor(user.role)} />;

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
      <Tabs.Screen name="calendar" options={{ title: 'Visits', tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen name="help" options={{ title: 'Help', tabBarIcon: tabIcon('help') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('more') }} />

      <Tabs.Screen name="link" options={{ href: null }} />
      <Tabs.Screen name="med" options={{ href: null }} />
      <Tabs.Screen name="appointment" options={{ href: null }} />
      <Tabs.Screen name="elder" options={{ href: null }} />
      <Tabs.Screen name="emergency" options={{ href: null }} />
      <Tabs.Screen name="circle" options={{ href: null }} />
      <Tabs.Screen name="availability" options={{ href: null }} />
      <Tabs.Screen name="help-detail" options={{ href: null }} />
    </Tabs>
  );
}
