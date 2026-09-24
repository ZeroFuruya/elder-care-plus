import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { LoadingScreen } from '@/components/loading-screen';
import { colors, fontSize } from '@/constants/theme';

const ICONS: Record<string, string> = {
  index: '\u2302',
  meds: '\u25A3',
  calendar: '\u25A6',
  emergency: '\u271A',
  profile: '\u25CF',
};

function tabIcon(name: keyof typeof ICONS) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: fontSize.heading }}>{ICONS[name]}</Text>;
  }
  return TabIcon;
}

/** Elder tabs: Home, Meds, Calendar, Emergency, Profile (docs/02-ui-ux-standard.md section 8). */
export default function ElderTabsLayout() {
  const { ready, user } = useAuth();

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;
  if (!user) return <Redirect href="/sign-in" />;
  if (user.role !== 'elder') return <Redirect href="/caregiver" />;

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
    </Tabs>
  );
}
