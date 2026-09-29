import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { bloodTypeLabels, dialNumber, emergencyCategoryLabels } from '@eldercare/shared';

import { useSessionUser } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { getEmergencyInfo, isEmergencySetComplete, primaryEmergencyNumber } from '@/db';
import type { ElderProfile, EmergencyNumber } from '@/db';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatDateWithYear, formatDateTime } from '@/lib/format';

/**
 * `E-07` Emergency Information — the elder's read-only emergency view
 * (docs/specs/sprint-2.md).
 *
 * Read-only by design: the caregiver owns every write, so nothing here edits a record. The
 * elder gets one dominant call action (usable under stress), the ordered contact list behind
 * a disclosure, and the approved non-clinical incomplete state until the emergency service
 * number is verified.
 */

/** The call label and dialer dialog title, verbatim from the approved copy table. */
function callLabel(name: string): string {
  return `Call ${name} - emergency contact`;
}

/** A `date` column arrives as `YYYY-MM-DD`; parse it at local midnight, never as UTC. */
function dayOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addressLines(profile: ElderProfile): string {
  return [
    profile.addressLine1,
    profile.addressLine2,
    [profile.city, profile.region, profile.postalCode].filter(Boolean).join(', '),
    profile.countryCode,
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join('\n');
}

export default function ElderEmergencyScreen() {
  const user = useSessionUser();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getEmergencyInfo(user.id), [user.id]);
  const { state, refreshing, reload } = useAsyncData(loader);
  const [callTarget, setCallTarget] = useState<EmergencyNumber | null>(null);
  const [contactsExpanded, setContactsExpanded] = useState(true);

  if (state.status === 'error') {
    return <ScreenError title="Emergency" showBell message={state.message} onRetry={reload} />;
  }

  if (state.status === 'loading') {
    return (
      <Screen title="Emergency" subtitle="Show this to anyone helping you" showBell>
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </Screen>
    );
  }

  const { profile, numbers } = state.data;
  const complete = isEmergencySetComplete(numbers);
  const primary = primaryEmergencyNumber(numbers);
  const address = profile ? addressLines(profile) : '';

  function openDialer(number: EmergencyNumber) {
    setCallTarget(null);
    void Linking.openURL(`tel:${dialNumber(number.phone)}`);
  }

  return (
    <Screen
      title="Emergency"
      subtitle="Show this to anyone helping you"
      showBell
      onRefresh={reload}
      refreshing={refreshing}
    >
      {profile === null ? (
        <Card>
          <Text style={styles.body}>
            No emergency information yet. Your caregiver sets this up.
          </Text>
        </Card>
      ) : (
        <>
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
                The emergency service number is not verified yet. Contact your caregiver.
              </Text>
            </View>
          )}

          <Card title="Who I am">
            <DetailRow label="Name" value={user.name} />
            <DetailRow
              label="Date of birth"
              value={profile.dateOfBirth ? formatDateWithYear(dayOnly(profile.dateOfBirth)) : null}
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
                <Text style={styles.disclosureGlyph}>{contactsExpanded ? '\u2304' : '\u203A'}</Text>
              </Pressable>

              {contactsExpanded
                ? numbers.map((number) => (
                    <Pressable
                      key={number.id}
                      accessibilityRole="button"
                      accessibilityLabel={callLabel(number.label)}
                      accessibilityHint={number.phone}
                      onPress={() => setCallTarget(number)}
                      style={({ pressed }) => [
                        styles.contact,
                        pressed ? styles.contactPressed : null,
                      ]}
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

          <Card title="Medicines">
            <Text style={styles.body}>Medicines are not shown here yet.</Text>
          </Card>
        </>
      )}

      <ConfirmDialog
        visible={callTarget !== null}
        title={callTarget ? callLabel(callTarget.label) : ''}
        description={callTarget ? callTarget.phone : ''}
        confirmLabel={callTarget ? `Call ${callTarget.label}` : 'Call'}
        onCancel={() => setCallTarget(null)}
        onConfirm={() => {
          if (callTarget) openDialer(callTarget);
        }}
      />
    </Screen>
  );
}

/** Renders nothing when the value is absent, so no "not recorded" filler string is invented. */
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!value) return null;

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
    detailRow: {
      gap: spacing.xs,
    },
    detailLabel: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    detailValue: {
      color: colors.text,
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
    disclosureGlyph: {
      color: colors.textMuted,
      fontSize: fontSize.heading,
      lineHeight: lineHeight.heading,
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
