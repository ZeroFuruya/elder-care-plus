import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Card } from '@/components/card';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { colors, fontSize, lineHeight, spacing } from '@/constants/theme';
import { inspectDatabase } from '@/db';
import { useAsyncData } from '@/hooks/use-async-data';

/**
 * Read-only view of the on-device SQLite database, for demonstrating the data layer. Reached from
 * the caregiver Profile. `eldercare.db` is the only datastore the app uses — it is not connected
 * to Supabase yet (see DEMO.md, "Known limits").
 */
export default function DatabaseScreen() {
  const loader = useCallback(() => inspectDatabase(), []);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (state.status === 'loading') return <LoadingScreen message="Reading the local database…" />;
  if (state.status === 'error') {
    return (
      <Screen title="Database" showBack>
        <Banner tone="error" message={state.message} />
      </Screen>
    );
  }

  const tables = state.data;

  return (
    <Screen
      title="Database"
      subtitle="Local SQLite · read-only"
      showBack
      onRefresh={reload}
      refreshing={refreshing}
    >
      <Text style={styles.intro}>
        The real tables this app stores on the device, in `eldercare.db`. This screen only reads;
        nothing here can change your data.
      </Text>

      {tables.map((table) => (
        <Card
          key={table.name}
          title={`${table.name} · ${table.rowCount} row${table.rowCount === 1 ? '' : 's'}`}
        >
          {table.rows.length === 0 ? (
            <Text style={styles.empty}>No rows.</Text>
          ) : (
            table.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.record}>
                <Text style={styles.recordIndex}>#{rowIndex + 1}</Text>
                {table.columns.map((column, columnIndex) => (
                  <View key={column} style={styles.cell}>
                    <Text style={styles.cellLabel}>{column}</Text>
                    <Text style={styles.cellValue}>{row[columnIndex]}</Text>
                  </View>
                ))}
              </View>
            ))
          )}

          {table.rowCount > table.rows.length ? (
            <Text style={styles.empty}>
              Showing the latest {table.rows.length} of {table.rowCount}.
            </Text>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontStyle: 'italic',
    lineHeight: lineHeight.caption,
  },
  record: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  recordIndex: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: lineHeight.caption,
  },
  cell: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cellLabel: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    width: 108,
  },
  cellValue: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
});
