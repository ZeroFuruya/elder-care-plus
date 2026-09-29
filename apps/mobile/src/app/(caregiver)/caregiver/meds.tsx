import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusBadge } from '@/components/status-badge';
import {
  cardSurface,
  fontSize,
  lineHeight,
  spacing,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';
import { getLinkedElder, listMedicines, type DoseView } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatTime } from '@/lib/format';

interface MedsData {
  elderName: string | null;
  medicines: { medicine: string; strength: string; instructions: string; next: DoseView }[];
}

/**
 * Caregiver medicines, read-only in this build.
 *
 * The write path (medicine + schedule + stock batch) belongs to the medication
 * plan and must run against Supabase; until then this tab shows the linked older
 * adult's plan and never pretends to save anything. The application only ever
 * stores what the caregiver types — it never suggests a medicine or a dose
 * (docs/00-product-flow.md, hard rules).
 */
export default function CaregiverMedsScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const loader = useCallback(async (): Promise<MedsData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { elderName: null, medicines: [] };
    return {
      elderName: link.elderName,
      medicines: await listMedicines(link.elderId),
    };
  }, [user.id]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading medicines…" />;
  if (state.status === 'error') {
    return <ScreenError title="Meds" message={state.message} onRetry={reload} />;
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
          description="Medicines set up for the linked older adult appear here with their next scheduled dose."
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
        Medicine details are entered by the caregiver and are never generated or suggested by the
        application.
      </Text>
    </Screen>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    card: {
      ...cardSurface(colors, elevation, gradients),
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
}
