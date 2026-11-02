import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { APP_LOCK_TIMEOUT_MS, PASSWORD_REQUIREMENTS } from '@eldercare/shared';

import { useAppLock } from '@/auth/app-lock';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * The Profile "Security" card (Sprint 11). It states the policy in plain words and gives the user
 * a way to lock the app on demand, which is also how the demo shows the lock without waiting.
 */
export function SecurityCard() {
  const { lockNow, biometric } = useAppLock();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const minutes = APP_LOCK_TIMEOUT_MS / 60_000;

  return (
    <Card title="Security">
      <Text style={styles.row}>
        <Text style={styles.label}>App lock: </Text>
        On. After {minutes} minutes in the background this app asks for{' '}
        {biometric.available
          ? `your ${biometric.label.toLowerCase()} or your password`
          : 'your password'}
        .
      </Text>

      <Text style={styles.row}>
        <Text style={styles.label}>Password: </Text>
        {PASSWORD_REQUIREMENTS}
      </Text>

      <Button
        label="Lock now"
        variant="secondary"
        onPress={lockNow}
        accessibilityHint="Locks the app immediately and asks for your fingerprint or password"
      />
    </Card>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    label: {
      color: colors.text,
      fontWeight: '700',
    },
    spacer: {
      height: spacing.xs,
    },
  });
}
