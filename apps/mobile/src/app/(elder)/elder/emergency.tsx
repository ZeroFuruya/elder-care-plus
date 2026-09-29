import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { demoEmergencyProfile } from '@/fixtures/emergency';

interface CallTarget {
  title: string;
  name: string;
  number: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function ElderEmergencyScreen() {
  const profile = demoEmergencyProfile;
  const [callTarget, setCallTarget] = useState<CallTarget | null>(null);

  return (
    <Screen title="Emergency" subtitle="Show this to anyone helping you">
      <Card title="This is me">
        <DetailRow label="Name" value={profile.fullName} />
        <DetailRow label="Date of birth" value={profile.dateOfBirth} />
        <DetailRow label="Blood type" value={profile.bloodType} />
        <DetailRow label="Address" value={profile.address} />
      </Card>

      <Card title="Conditions">
        <DetailRow label="Diagnosed with" value={profile.conditions.join(', ')} />
        <DetailRow label="Allergies" value={profile.allergies.join(', ')} />
      </Card>

      <Card title="Current medicines">
        <DetailRow label="Taking" value={profile.medicines.join(', ')} />
      </Card>

      <Card title="Care instructions">
        <Text style={styles.body}>{profile.instructions}</Text>
      </Card>

      <Card title="Who to call">
        <DetailRow label="Doctor" value={profile.physician.name} />
        <Button
          label={`Call ${profile.physician.name}`}
          variant="secondary"
          onPress={() =>
            setCallTarget({
              title: 'Call the doctor?',
              name: profile.physician.name,
              number: profile.physician.number,
            })
          }
          accessibilityLabel={`Call ${profile.physician.name} at ${profile.physician.number}`}
        />

        <DetailRow label="Emergency contact" value={profile.emergencyContact.name} />
        <Button
          label="Call my emergency contact"
          variant="danger"
          onPress={() =>
            setCallTarget({
              title: 'Call your emergency contact?',
              name: profile.emergencyContact.name,
              number: profile.emergencyContact.number,
            })
          }
          accessibilityLabel={`Call ${profile.emergencyContact.name} at ${profile.emergencyContact.number}`}
        />
      </Card>

      <Text style={styles.note}>
        Sample emergency information for the demonstration. It is stored on this device only.
      </Text>

      <ConfirmDialog
        visible={callTarget !== null}
        title={callTarget?.title ?? ''}
        description={callTarget ? `${callTarget.name}\n${callTarget.number}` : ''}
        confirmLabel="Call"
        onCancel={() => setCallTarget(null)}
        onConfirm={() => {
          const target = callTarget;
          setCallTarget(null);
          if (target) void Linking.openURL(`tel:${target.number.replace(/[^+\d]/g, '')}`);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  rowValue: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: '600',
    lineHeight: lineHeight.body,
  },
  body: {
    color: colors.text,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
