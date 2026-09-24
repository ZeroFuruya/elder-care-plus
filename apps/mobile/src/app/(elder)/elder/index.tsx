import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner, type BannerTone } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DoseCard } from '@/components/dose-card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { confirmDose, loadDemoSafeDay, summarise } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatLongDate, formatTime, greeting } from '@/lib/format';

export default function ElderHomeScreen() {
  const user = useSessionUser();
  const loader = useCallback(() => loadDemoSafeDay(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  const [banner, setBanner] = useState<{ tone: BannerTone; message: string } | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const markTaken = async (doseId: string, medicine: string) => {
    setMarkingId(doseId);
    const recorded = await confirmDose(doseId, user.id);
    setMarkingId(null);

    setBanner({
      tone: recorded ? 'success' : 'error',
      message: recorded
        ? `${medicine} marked as taken at ${formatTime(new Date())}. Your family caregiver can see this now.`
        : 'That dose was already recorded, so nothing changed.',
    });

    await reload();
  };

  if (state.status === 'loading') return <LoadingScreen message="Loading today's doses…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Today" showBell>
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const doses = state.data;
  const summary = summarise(doses);
  const firstName = user.name.split(' ')[0];

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
      </Card>

      {banner ? <Banner tone={banner.tone} message={banner.message} /> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your doses today</Text>
        {doses.length === 0 ? (
          <EmptyState
            title="No doses scheduled"
            description="There is nothing to take today. Your family caregiver sets the schedule."
          />
        ) : (
          doses.map((dose) => (
            <DoseCard
              key={dose.id}
              dose={dose}
              marking={markingId === dose.id}
              onMarkTaken={
                dose.status === 'due'
                  ? () => {
                      void markTaken(dose.id, dose.medicine);
                    }
                  : undefined
              }
            />
          ))
        )}
      </View>

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
