import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { colors, fontSize, lineHeight, radius, spacing } from '@/constants/theme';
import { listMedicines } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatTime } from '@/lib/format';

export default function ElderMedsScreen() {
  const user = useSessionUser();
  const loader = useCallback(() => listMedicines(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading your medicines…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Meds">
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const medicines = state.data;

  return (
    <Screen title="Meds" subtitle="What you take" onRefresh={reload} refreshing={refreshing}>
      {medicines.length === 0 ? (
        <EmptyState
          title="No medicines yet"
          description="Your family caregiver adds medicines and schedules here."
        />
      ) : (
        medicines.map((entry) => (
          <View key={`${entry.medicine}-${entry.strength}`} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.medicine}>
                {entry.medicine} {entry.strength}
              </Text>
              <StatusBadge status={entry.next.status} />
            </View>
            <Text style={styles.instructions}>{entry.instructions}</Text>
            <Text style={styles.meta}>
              {entry.next.status === 'due' || entry.next.status === 'upcoming'
                ? 'Next dose at'
                : 'Most recent dose'}{' '}
              {formatTime(entry.next.scheduledAt)}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.note}>
        This list is read-only. It is never changed by an automatic process, and no advice about
        medicines is generated here.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  top: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  medicine: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '700',
    lineHeight: lineHeight.body,
  },
  instructions: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  meta: {
    color: colors.text,
    fontSize: fontSize.caption,
    fontWeight: '600',
    lineHeight: lineHeight.caption,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
