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
  reports: 'reports',
  profile: 'person',
};

function tabIcon(name: keyof typeof TAB_ICONS) {
  function TabIconFor({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <TabIcon name={TAB_ICONS[name]} color={color} focused={focused} />;
  }
  return TabIconFor;
}

/** Caregiver tabs: Dashboard, Meds, Calendar, Reports, Profile. */
export default function CaregiverTabsLayout() {
  const { ready, user } = useAuth();
  const { colors } = useAppTheme();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;
  if (!user) return <Redirect href="/sign-in" />;
  if (user.role !== 'caregiver') return <Redirect href={homeRouteFor(user.role)} />;

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
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon('index') }} />
      <Tabs.Screen name="meds" options={{ title: 'Meds', tabBarIcon: tabIcon('meds') }} />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: tabIcon('reports') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
      {/* Reachable from the dashboard and profile; hidden from the tab bar. */}
      <Tabs.Screen name="link" options={{ href: null }} />
      {/* Sprint 2 elder profile and emergency contacts: C-10 read, C-11 edit, A-09 create. */}
      <Tabs.Screen name="elder" options={{ href: null }} />
      <Tabs.Screen name="elder-edit" options={{ href: null }} />
      <Tabs.Screen name="elder-new" options={{ href: null }} />
      {/* Sprint 3 medication plan: C-02 is the `meds` tab above; C-03 add/edit and C-04 detail are
          pushed screens, hidden from the tab bar. */}
      <Tabs.Screen name="med-new" options={{ href: null }} />
      <Tabs.Screen name="med-edit" options={{ href: null }} />
      <Tabs.Screen name="med" options={{ href: null }} />
      {/* Sprint 7 appointments: `C-06` is the `calendar` tab above; `C-07` (add/edit, titled
          "New appointment") and `C-08` (detail) are pushed screens, hidden from the tab bar. */}
      <Tabs.Screen name="appointment" options={{ href: null }} />
      <Tabs.Screen name="appointment-edit" options={{ href: null }} />
      {/* Sprint 4 dose detail (`C-05` missed dose), pushed from the dashboard. */}
      <Tabs.Screen name="dose" options={{ href: null }} />
      {/* Sprint 8 help requests (Flow F), reached from the notification centre. */}
      <Tabs.Screen name="help" options={{ href: null }} />
      {/* Sprint 9 care-activity timeline (C-12), reached from Reports. */}
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
  );
}
