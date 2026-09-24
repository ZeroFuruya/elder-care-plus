import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { colors, fontSize, lineHeight, radius, spacing } from '@/constants/theme';
import { getLinkedElder, listMedicines, type DoseView } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatTime } from '@/lib/format';

interface MedsData {
  elderName: string | null;
  medicines: { medicine: string; strength: string; instructions: string; next: DoseView }[];
}

export default function CaregiverMedsScreen() {
  const user = useSessionUser();

  const loader = useCallback(async (): Promise<MedsData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { elderName: null, medicines: [] };
    return { elderName: link.elderName, medicines: await listMedicines(link.elderId) };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading medicines…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Meds">
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const { elderName, medicines } = state.data;

  return (
    <Screen
      title="Meds"
      subtitle={elderName ? `Taken by ${elderName}` : 'No older adult linked'}
      onRefresh={reload}
      refreshing={refreshing}
    >
      {medicines.length === 0 ? (
        <EmptyState
          title="No medicines yet"
          description="Medicines added for the linked older adult appear here with their next scheduled dose."
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
        Read-only view. Medicine details are entered by the caregiver and are never generated or
        changed by the application.
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
