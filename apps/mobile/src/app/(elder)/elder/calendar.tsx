import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight } from '@/constants/theme';

export default function ElderCalendarScreen() {
  return (
    <Screen title="Calendar" subtitle="Appointments">
      <EmptyState
        title="No appointments yet"
        description="Clinic visits and home visits will be listed here with their date and time."
      />

      <Card title="Coming next">
        <Text style={styles.body}>
          Appointment scheduling is the next module in the build plan. Medicines and dose
          confirmations already work, and this screen is wired to the same data layer so it can be
          filled in without any rework.
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
