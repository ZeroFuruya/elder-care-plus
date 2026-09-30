import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading…' }: LoadingScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flex: 1,
      gap: spacing.md,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    message: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      textAlign: 'center',
    },
  });
}
