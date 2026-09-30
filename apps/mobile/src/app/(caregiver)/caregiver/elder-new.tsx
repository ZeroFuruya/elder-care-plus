import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSessionUser } from '@/auth/auth-context';
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
 * `A-09` Create Elder Profile — the caregiver setup step (docs/specs/sprint-2.md).
 *
 * The emergency contacts come first here on purpose: the profile's primary action saves and
 * continues to `C-10`, so the safety-critical contacts must be collectable before that. Each
 * contact is written on its own, so nothing is lost if the caregiver leaves mid-form.
 */
export default function A09CreateElderProfile() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getElderRecordForCaregiver(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'error') {
    return (
      <ScreenError title="Create elder profile" showBell message={state.message} onRetry={reload} />
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen title="Create elder profile" showBack>
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </Screen>
    );
  }

  const record = state.data;

  if (!record) {
    return (
      <Screen title="Create elder profile" showBack>
        <EmptyState title="No linked older adult" description="Link with older adult first." />
      </Screen>
    );
  }

  return (
    <Screen title="Create elder profile" showBack onRefresh={reload} refreshing={refreshing}>
      <EmergencyNumbersEditor
        elderId={record.elderId}
        numbers={record.numbers}
        onChanged={reload}
      />
      <ElderProfileForm
        elderId={record.elderId}
        initial={record.profile}
        submitLabel="Save and continue"
        doctorSectionTitle="Doctor and emergency"
        onSaved={() => router.replace('/caregiver/elder')}
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
