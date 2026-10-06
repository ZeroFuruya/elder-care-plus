import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Card } from '@/components/card';
import { ChoiceChips, type ChoiceOption } from '@/components/choice-chips';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { ReportRangeChips } from '@/components/report-range-chips';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import {
  cardSurface,
  fontSize,
  lineHeight,
  spacing,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';
import {
  getLinkedElder,
  listCareActivity,
  listMedications,
  type CareActivity,
  type Medication,
  type ReportRange,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { addDays, endOfDay, formatDateTime, startOfDay } from '@/lib/format';

type KindFilter = 'all' | 'audit' | 'stock';

const KIND_OPTIONS: ChoiceOption<KindFilter>[] = [
  { value: 'all', label: 'Everything' },
  { value: 'audit', label: 'Care changes' },
  { value: 'stock', label: 'Stock' },
];

const ALL_MEDICINES = 'ALL';

interface ActivityData {
  elderId: string | null;
  activities: CareActivity[];
  medications: Medication[];
}

/**
 * `C-12` Care Activity Timeline (docs/specs/sprint-9.md).
 *
 * A read-only, newest-first merge of the audited care-plan changes and the stock
 * ledger, filterable by kind, period and medicine. Admitting the manager only:
 * RLS returns a family member zero `audit_events` rows, and the stock ledger is a
 * plain read.
 */
export default function CaregiverActivityScreen() {
  const user = useSessionUser();
  const { colors, elevation, gradients } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, elevation, gradients),
    [colors, elevation, gradients],
  );

  const [range, setRange] = useState<ReportRange>(7);
  const [kind, setKind] = useState<KindFilter>('all');
  const [medicationId, setMedicationId] = useState<string>(ALL_MEDICINES);

  const loader = useCallback(async (): Promise<ActivityData> => {
    const link = await getLinkedElder(user.id);
    if (!link) return { elderId: null, activities: [], medications: [] };

    const now = new Date();
    const [activities, medications] = await Promise.all([
      listCareActivity(link.elderId, {
        kind,
        from: startOfDay(addDays(now, -(range - 1))),
        to: endOfDay(now),
        medicationId: medicationId === ALL_MEDICINES ? undefined : medicationId,
      }),
      listMedications(link.elderId),
    ]);

    return { elderId: link.elderId, activities, medications };
  }, [user.id, range, kind, medicationId]);

  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Loading activity…" />;
  if (state.status === 'error') {
    return (
      <ScreenError
        title="Care activity"
        message={state.message}
        onRetry={reload}
        showBack
        safeBottom
      />
    );
  }

  if (state.data.elderId === null) {
    return (
      <Screen title="Care activity" showBack safeBottom>
        <EmptyState
          title="Nothing to show yet"
          description="Link an older adult account to see their care activity."
        />
      </Screen>
    );
  }

  const { activities, medications } = state.data;
  const medicineOptions: ChoiceOption<string>[] = [
    { value: ALL_MEDICINES, label: 'All medicines' },
    ...medications.map((medication) => ({ value: medication.id, label: medication.name })),
  ];

  return (
    <Screen
      title="Care activity"
      subtitle="Care changes and stock"
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Card title="Filters">
        <ReportRangeChips value={range} onChange={setRange} />
        <ChoiceChips label="Show" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        {kind === 'audit' ? null : (
          <ChoiceChips
            label="Medicine"
            options={medicineOptions}
            value={medicationId}
            onChange={setMedicationId}
          />
        )}
      </Card>

      {activities.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Care-plan changes and stock movements appear here as they are recorded."
        />
      ) : (
        <View style={styles.list}>
          {activities.map((activity) => (
            <View key={activity.id} style={styles.row}>
              <Text style={styles.title}>{activity.title}</Text>
              {activity.subtitle ? <Text style={styles.subtitle}>{activity.subtitle}</Text> : null}
              <Text style={styles.when}>{formatDateTime(activity.at)}</Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function createStyles(colors: AppThemeColors, elevation: AppElevation, gradients: AppGradients) {
  return StyleSheet.create({
    list: {
      gap: spacing.sm,
    },
    row: {
      ...cardSurface(colors, elevation, gradients),
      gap: spacing.xs,
      padding: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      lineHeight: lineHeight.body,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    when: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
