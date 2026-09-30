import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ElderProfileForm } from '@/components/elder-profile-form';
import { EmergencyNumbersEditor } from '@/components/emergency-numbers-editor';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, type AppThemeColors } from '@/constants/theme';
import { getElderRecordForCaregiver } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * `C-11` Edit Elder Profile — the caregiver's write surface for the elder record
 * (docs/specs/sprint-2.md). It is the only place a contact can be added, verified, reordered or
 * deactivated, because acceptance criterion 18 keeps `C-10` read-only.
 *
 * The profile fields come first (this is an edit screen); saving returns to the read view.
 */
export default function C11EditElderProfile() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getElderRecordForCaregiver(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'error') {
    return (
      <ScreenError title="Edit elder profile" showBell message={state.message} onRetry={reload} />
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen title="Edit elder profile" showBack>
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </Screen>
    );
  }

  const record = state.data;

  if (!record) {
    return (
      <Screen title="Edit elder profile" showBack>
        <EmptyState title="No linked older adult" description="Link with older adult first." />
      </Screen>
    );
  }

  if (!record.profile) {
    return (
      <Screen title="Edit elder profile" showBack onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No emergency information yet."
          description="Create the older adult's care and emergency profile."
        />
        <Button
          label="Create elder profile"
          onPress={() => router.push('/caregiver/elder-new')}
          accessibilityHint="Opens the elder profile form"
        />
      </Screen>
    );
  }

  return (
    <Screen title="Edit elder profile" showBack onRefresh={reload} refreshing={refreshing}>
      <ElderProfileForm
        elderId={record.elderId}
        initial={record.profile}
        submitLabel="Save changes"
        doctorSectionTitle="Doctor"
        onSaved={() => router.replace('/caregiver/elder')}
      />
      <EmergencyNumbersEditor
        elderId={record.elderId}
        numbers={record.numbers}
        onChanged={reload}
      />
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    muted: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
  });
}
