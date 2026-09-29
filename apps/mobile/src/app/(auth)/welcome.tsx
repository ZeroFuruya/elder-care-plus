import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <Screen title="ElderCare+" subtitle="Family care coordination" safeBottom>
      <View style={styles.hero}>
        <Text style={styles.headline}>Medicines, appointments and peace of mind.</Text>
        <Text style={styles.body}>
          One shared record between an older adult, their caregiver and the family members they
          trust.
        </Text>
      </View>

      <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      <Button
        label="Create an account"
        variant="secondary"
        onPress={() => router.push('/sign-up')}
        accessibilityHint="Opens the registration form"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  headline: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: '700',
    lineHeight: lineHeight.title,
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
});
