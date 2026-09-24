import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight } from '@/constants/theme';

export default function CaregiverCalendarScreen() {
  return (
    <Screen title="Calendar" subtitle="Appointments">
      <EmptyState
        title="No appointments yet"
        description="Clinic and home visits for the linked older adult will appear here."
      />

      <Card title="Coming next">
        <Text style={styles.body}>
          Appointment scheduling is the next module in the build plan. Both roles read the same
          record, so once appointments exist here the older adult sees them on their Calendar tab.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
