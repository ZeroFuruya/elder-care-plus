import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface ScreenProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showBell?: boolean;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  /** Stack (non-tab) screens must clear the bottom inset themselves. */
  safeBottom?: boolean;
}

/** Standard screen frame: safe area, top app bar, scrollable body. */
export function Screen({
  title,
  subtitle,
  showBack,
  showBell,
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  safeBottom = false,
}: ScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={safeBottom ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}
    >
      <AppBar title={title} subtitle={subtitle} showBack={showBack} showBell={showBell} />
      {body}
    </SafeAreaView>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.md,
      padding: spacing.lg,
    },
  });
}
