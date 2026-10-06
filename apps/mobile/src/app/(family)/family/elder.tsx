import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { bloodTypeLabels, emergencyCategoryLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
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
 * `F-04` Family Elder Profile (docs/specs/sprint-8.md).
 *
 * The linked elder's approved identity, medical summary, emergency contacts and doctor,
 * read-only. Same data as the caregiver's `C-10`, with no edit affordance.
 */
export default function FamilyElderProfile() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getElderRecordForCaregiver(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'error') {
    return <ScreenError title="Elder profile" showBack message={state.message} onRetry={reload} />;
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
        <EmptyState
          title="No record is shared with you"
          description="Ask your family caregiver for a six-digit invite code, then enter it on the Home tab."
        />
      </Screen>
    );
  }

  const profile = record.profile;

  if (!profile) {
    return (
      <Screen title="Elder profile" showBack onRefresh={reload} refreshing={refreshing}>
        <EmptyState
          title="No profile yet"
          description="The family caregiver sets up the older adult's care and emergency profile."
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
