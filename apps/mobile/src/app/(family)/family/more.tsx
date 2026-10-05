import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DeactivateAccount } from '@/components/deactivate-account';
import { LogoutButton } from '@/components/logout-button';
import { Screen } from '@/components/screen';
import { fontSize, lineHeight, type AppThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * Family `More` tab (docs/specs/sprint-8.md). Read-only routes that do not earn their own tab:
 * the elder profile (`F-04`) and emergency information (`F-09`), plus account actions.
 */
export default function FamilyMoreScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen title="More" subtitle="Read-only access">
      <Card title="The older adult">
        <Text style={styles.body}>
          Your access is read-only. Only the older adult and their caregiver can change anything.
        </Text>
        <Button label="Elder profile" onPress={() => router.push('/family/elder')} />
        <Button
          label="Emergency information"
          variant="secondary"
          onPress={() => router.push('/family/emergency')}
        />
      </Card>

      <DeactivateAccount />

      <LogoutButton size="large" />
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    body: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
