import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { DEMO_CAREGIVER, DEMO_ELDER, DEMO_PASSWORD } from '@/db';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <Screen title="ElderCare+" subtitle="Family care coordination">
      <View style={styles.hero}>
        <Text style={styles.headline}>Medicines, appointments and peace of mind.</Text>
        <Text style={styles.body}>
          One shared record between an older adult and the family member who looks after them.
        </Text>
      </View>

      <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      <Button
        label="Create an account"
        variant="secondary"
        onPress={() => router.push('/sign-up')}
        accessibilityHint="Opens the registration form"
      />

      <Card title="Demo accounts">
        <Text style={styles.body}>
          These are seeded when the app first starts, and the password is{' '}
          <Text style={styles.code}>{DEMO_PASSWORD}</Text> for both.
        </Text>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Family caregiver</Text>
          <Text style={styles.code}>{DEMO_CAREGIVER.email}</Text>
        </View>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Older adult</Text>
          <Text style={styles.code}>{DEMO_ELDER.email}</Text>
        </View>
      </Card>
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
  accountRow: {
    gap: spacing.xs,
  },
  accountLabel: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  code: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: lineHeight.caption,
  },
});
