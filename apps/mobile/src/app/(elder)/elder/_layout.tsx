import { Tabs } from 'expo-router';

import { colors, fontSize } from '@/constants/theme';

/** Elder tabs (docs/00-product-flow.md section 3). Emergency is always one tap away. */
export default function ElderTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.caption },
        tabBarStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="medicines" options={{ title: 'Medicines' }} />
      <Tabs.Screen name="prescriptions" options={{ title: 'Prescriptions' }} />
      <Tabs.Screen name="appointments" options={{ title: 'Appointments' }} />
      <Tabs.Screen name="emergency" options={{ title: 'Emergency' }} />
    </Tabs>
  );
}
