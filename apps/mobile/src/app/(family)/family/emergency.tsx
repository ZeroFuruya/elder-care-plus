import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { bloodTypeLabels, dialNumber, emergencyCategoryLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DetailRow } from '@/components/detail-row';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import {
  fontSize,
  lineHeight,
  radius,
  spacing,
  touchTarget,
  type AppThemeColors,
} from '@/constants/theme';
import {
  elderAddressLines,
  getElderRecordForCaregiver,
  isEmergencySetComplete,
  primaryEmergencyNumber,
  type EmergencyNumber,
} from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateWithYear, formatDateTime, parseDayOnly } from '@/lib/format';

/**
 * `F-09` Family Emergency Information (docs/specs/sprint-8.md).
 *
 * The approved emergency contacts and safety information, read-only. The family member can
 * place a call (the action the wireframe intends) but cannot change any record.
 */

function callLabel(name: string): string {
  return `Call ${name} - emergency contact`;
}

export default function FamilyEmergencyInformation() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getElderRecordForCaregiver(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);
  const [callTarget, setCallTarget] = useState<EmergencyNumber | null>(null);
  const [contactsExpanded, setContactsExpanded] = useState(true);

  if (state.status === 'error') {
    return <ScreenError title="Emergency" message={state.message} onRetry={reload} />;
  }

  if (state.status === 'loading') {
    return (
      <Screen title="Emergency" showBack>
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </Screen>
    );
  }

  const record = state.data;

  if (!record || !record.profile) {
    return (
      <Screen title="Emergency" showBack>
        <EmptyState
          title="No emergency information yet"
          description="The family caregiver sets up the older adult's emergency contacts and safety information."
        />
      </Screen>
    );
  }

  const profile = record.profile;
  const numbers = record.numbers;
  const complete = isEmergencySetComplete(numbers);
  const primary = primaryEmergencyNumber(numbers);
  const address = elderAddressLines(profile);

  return (
    <Screen
      title="Emergency"
      subtitle="For the older adult"
      showBack
      onRefresh={reload}
      refreshing={refreshing}
    >
      {primary ? (
        <Button
          label={callLabel(primary.label)}
          accessibilityHint={primary.phone}
          onPress={() => setCallTarget(primary)}
        />
      ) : null}

      {complete ? null : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            The emergency service number is not verified yet. Contact the caregiver.
          </Text>
        </View>
      )}

      <Card title="Who they are">
        <DetailRow label="Name" value={record.elderName} />
        <DetailRow
          label="Date of birth"
          value={profile.dateOfBirth ? formatDateWithYear(parseDayOnly(profile.dateOfBirth)) : null}
        />
      </Card>

      <Card title="Health">
        <DetailRow label="Blood type" value={bloodTypeLabels[profile.bloodType]} />
        <DetailRow label="Conditions" value={profile.conditions} />
        <DetailRow label="Allergies" value={profile.allergies} />
      </Card>

      {numbers.length > 0 ? (
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Emergency contacts"
            accessibilityState={{ expanded: contactsExpanded }}
            onPress={() => setContactsExpanded((current) => !current)}
            style={styles.disclosure}
          >
            <Text style={styles.disclosureLabel}>Emergency contacts</Text>
            <Icon
              name={contactsExpanded ? 'collapse' : 'forward'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>

          {contactsExpanded
            ? numbers.map((number) => (
                <Pressable
                  key={number.id}
                  accessibilityRole="button"
                  accessibilityLabel={callLabel(number.label)}
                  accessibilityHint={number.phone}
                  onPress={() => setCallTarget(number)}
                  style={({ pressed }) => [styles.contact, pressed ? styles.contactPressed : null]}
                >
                  <Text style={styles.contactCategory}>
                    {emergencyCategoryLabels[number.category]}
                  </Text>
                  <Text style={styles.contactLabel}>{number.label}</Text>
                  <Text style={styles.contactPhone}>{number.phone}</Text>
                  {number.verifiedAt ? (
                    <Text style={styles.verified}>
                      {'Verified by caregiver'}
                      {'\n'}
                      {formatDateTime(number.verifiedAt)}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            : null}
        </Card>
      ) : null}

      {profile.careInstructions ? (
        <Card title="Care instructions">
          <Text style={styles.body}>{profile.careInstructions}</Text>
        </Card>
      ) : null}

      {profile.doctorName || profile.doctorPhone ? (
        <Card title="Doctor">
          <DetailRow label="Name" value={profile.doctorName} />
          <DetailRow label="Phone" value={profile.doctorPhone} />
        </Card>
      ) : null}

      {address ? (
        <Card title="Address">
          <Text style={styles.body}>{address}</Text>
        </Card>
      ) : null}

      <ConfirmDialog
        visible={callTarget !== null}
        title={callTarget ? callLabel(callTarget.label) : ''}
        description={callTarget ? callTarget.phone : ''}
        confirmLabel={callTarget ? `Call ${callTarget.label}` : 'Call'}
        onCancel={() => setCallTarget(null)}
        onConfirm={() => {
          if (callTarget) {
            const target = callTarget;
            setCallTarget(null);
            void Linking.openURL(`tel:${dialNumber(target.phone)}`);
          }
        }}
      />
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
    notice: {
      backgroundColor: colors.surface,
      borderColor: colors.warning,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.md,
    },
    noticeText: {
      color: colors.warning,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
    },
    disclosure: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: touchTarget.min,
    },
    disclosureLabel: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      fontWeight: '700',
      lineHeight: lineHeight.caption,
      textTransform: 'uppercase',
    },
    contact: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      gap: spacing.xs,
      minHeight: touchTarget.min,
      padding: spacing.md,
    },
    contactPressed: {
      opacity: 0.85,
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
    verified: {
      color: colors.success,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
