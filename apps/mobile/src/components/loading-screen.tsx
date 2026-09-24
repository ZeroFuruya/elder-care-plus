import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading…' }: LoadingScreenProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
