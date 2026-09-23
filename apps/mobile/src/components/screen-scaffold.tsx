import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, radius, spacing } from '@/constants/theme';

type ScreenScaffoldProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

/**
 * Navigation-skeleton screen. Carries no care data — real screens replace this
 * per sprint, after an approved spec in docs/specs/.
 */
export function ScreenScaffold({ title, description, children }: ScreenScaffoldProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {children}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Scaffold screen — synthetic data only. No clinical advice is ever shown here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.body,
    lineHeight: 26,
  },
  notice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    lineHeight: 22,
  },
});
