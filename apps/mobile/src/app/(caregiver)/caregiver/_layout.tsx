import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { homeRouteFor } from '@/auth/routes';
import { LoadingScreen } from '@/components/loading-screen';
import { colors, fontSize } from '@/constants/theme';

const ICONS: Record<string, string> = {
  index: '\u2302',
  meds: '\u25A3',
  calendar: '\u25A6',
  reports: '\u2197',
  profile: '\u25CF',
};

function tabIcon(name: keyof typeof ICONS) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: fontSize.heading }}>{ICONS[name]}</Text>;
  }
  return TabIcon;
}

/** Caregiver tabs: Dashboard, Meds, Calendar, Reports, Profile. */
export default function CaregiverTabsLayout() {
  const { ready, user } = useAuth();

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
    </Tabs>
  );
}
