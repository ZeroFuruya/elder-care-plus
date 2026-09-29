import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import {
  listDosesForDay,
  listElderCircle,
  summarise,
  type DoseView,
  type ElderCircleLink,
} from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatLongDate, greeting } from '@/lib/format';

/**
 * The older adult's day. Dose confirmation is deliberately absent in this
 * build: the real confirmation loop writes to Supabase (Sprint 3/4), and a
 * local-only write must never look like the caregiver can see it
 * (docs/specs/sprint-1b.md, "Legacy store").
 */

interface HomeData {
  doses: DoseView[];
  circle: ElderCircleLink[];
}

export default function ElderHomeScreen() {
  const user = useSessionUser();
  const loader = useCallback(async (): Promise<HomeData> => {
    const [doses, circle] = await Promise.all([
      listDosesForDay(user.id, new Date()),
      listElderCircle(user.id),
    ]);
    return { doses, circle };
  }, [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading today's doses…" />;
  if (state.status === 'error') {
    return <ScreenError title="Today" showBell message={state.message} onRetry={reload} />;
  }

  const doses = state.data.doses;
  const summary = summarise(doses);
  const firstName = user.name.split(' ')[0];

  const caregiver =
    state.data.circle.find((link) => link.memberRole === 'caregiver' && link.status === 'active') ??
    null;
  const awaitingConsent = state.data.circle.filter((link) => link.status === 'invited');

  const parts = [`${doses.length} ${doses.length === 1 ? 'dose' : 'doses'} today`];
  if (summary.due > 0) parts.push(`${summary.due} due now`);
  if (summary.taken > 0) parts.push(`${summary.taken} taken`);
  if (summary.missed > 0) parts.push(`${summary.missed} missed`);

  return (
    <Screen
      title="Today"
      subtitle={formatLongDate(new Date())}
      showBell
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card>
        <Text style={styles.greeting}>
          {greeting()}, {firstName}
        </Text>
        <Text style={styles.summary}>{parts.join(' · ')}</Text>
        <Text style={styles.summary}>
          {caregiver
            ? `Linked caregiver: ${caregiver.memberLabel}`
            : 'No caregiver is linked to this account yet.'}
        </Text>
      </Card>

      {awaitingConsent.length > 0 ? (
        <Button
          label={`Review ${awaitingConsent.length === 1 ? 'a family member’s access' : `${awaitingConsent.length} family members’ access`}`}
          onPress={() => router.push('/elder/circle')}
          accessibilityHint="Opens the care circle so you can approve or refuse access"
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your doses today</Text>
        {doses.length === 0 ? (
          <EmptyState
            title="No doses scheduled"
            description="There is nothing to take today. Your family caregiver sets the schedule."
          />
        ) : (
          doses.map((dose) => <DoseCard key={dose.id} dose={dose} />)
        )}
      </View>

      <Button
        label={caregiver ? 'Care circle' : 'Enter a caregiver’s code'}
        variant="secondary"
        onPress={() => router.push(caregiver ? '/elder/circle' : '/elder/link')}
        accessibilityHint={
          caregiver
            ? 'Shows who can see your record and lets you remove access'
            : 'Opens the screen where you enter the six-digit code from your caregiver'
        }
      />

      <Button
        label="Emergency information"
        variant="secondary"
        onPress={() => router.push('/elder/emergency')}
        accessibilityHint="Opens your emergency card, always one tap away"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: {
    color: colors.text,
    fontSize: fontSize.heading,
    fontWeight: '700',
    lineHeight: lineHeight.heading,
  },
  summary: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: lineHeight.caption,
    textTransform: 'uppercase',
  },
});
