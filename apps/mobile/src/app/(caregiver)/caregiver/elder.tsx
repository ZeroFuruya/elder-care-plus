import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { bloodTypeLabels, emergencyCategoryLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DetailRow } from '@/components/detail-row';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { fontSize, lineHeight, radius, spacing, type AppThemeColors } from '@/constants/theme';
import { elderAddressLines, getElderRecordForCaregiver } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateWithYear, formatDateTime, parseDayOnly } from '@/lib/format';

/**
 * `C-10` Elder Profile — the caregiver's read view of the elder record
 * (docs/specs/sprint-2.md).
 *
 * Read-only by contract: acceptance criterion 18 requires `C-10` to render without an edit
 * affordance, so every change goes through `C-11` (reached from the Profile tab) and the
 * emergency contacts carry their verified state here rather than an inline action.
 */

/** The honest empty state for a caregiver who has no active link yet. */
const NO_LINK_TITLE = 'No linked older adult';
const NO_LINK_DESCRIPTION = 'Link with older adult first.';

export default function C10ElderProfile() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getElderRecordForCaregiver(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'error') {
    return <ScreenError title="Elder profile" showBell message={state.message} onRetry={reload} />;
  }

  if (state.status === 'loading') {
    return (
      <Screen title="Elder profile" showBack>
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </Screen>
    );
  }

  const record = state.data;

  if (!record) {
    return (
      <Screen title="Elder profile" showBack>
        <EmptyState title={NO_LINK_TITLE} description={NO_LINK_DESCRIPTION} />
      </Screen>
    );
  }

  const profile = record.profile;

  if (!profile) {
    return (
      <Screen title="Elder profile" showBack onRefresh={reload} refreshing={refreshing}>
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

  const address = elderAddressLines(profile);

  return (
    <Screen title="Elder profile" showBack onRefresh={reload} refreshing={refreshing}>
      <Card title="Identity">
        <DetailRow label="Full name" value={record.elderName} />
        <DetailRow
          label="Birth date"
          value={profile.dateOfBirth ? formatDateWithYear(parseDayOnly(profile.dateOfBirth)) : null}
        />
        <DetailRow label="Blood type" value={bloodTypeLabels[profile.bloodType]} />
      </Card>

      <Card title="Medical summary">
        <DetailRow label="Conditions" value={profile.conditions} />
        <DetailRow label="Allergies" value={profile.allergies} />
        <DetailRow label="Care instructions" value={profile.careInstructions} />
      </Card>

      <Card title="Emergency contacts">
        {record.numbers.length === 0 ? (
          <Text style={styles.muted}>No emergency contacts yet.</Text>
        ) : (
          record.numbers.map((number) => (
            <View key={number.id} style={styles.contact}>
              <Text style={styles.contactCategory}>{emergencyCategoryLabels[number.category]}</Text>
              <Text style={styles.contactLabel}>{number.label}</Text>
              <Text style={styles.contactPhone}>{number.phone}</Text>
              {number.isPrimary ? <Text style={styles.contactPrimary}>Primary contact</Text> : null}
              {number.verifiedAt ? (
                <Text style={styles.contactVerified}>
                  {'Verified by caregiver'}
                  {'\n'}
                  {formatDateTime(number.verifiedAt)}
                </Text>
              ) : (
                <Text style={styles.contactUnverified}>Not verified yet</Text>
              )}
            </View>
          ))
        )}
      </Card>

      <Card title="Doctor">
        <DetailRow label="Primary doctor" value={profile.doctorName} />
        <DetailRow label="Phone number" value={profile.doctorPhone} />
      </Card>

      {address ? (
        <Card title="Address">
          <Text style={styles.body}>{address}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    body: {
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    muted: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    contact: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      gap: spacing.xs,
      padding: spacing.md,
    },
    contactCategory: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    contactLabel: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
    },
    contactPhone: {
      color: colors.primary,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    contactPrimary: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
    },
    contactVerified: {
      color: colors.success,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    contactUnverified: {
      color: colors.warning,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
