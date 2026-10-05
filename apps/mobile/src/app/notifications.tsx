import { notificationPresentation } from '@eldercare/shared';
import { Redirect, router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { ScreenError } from '@/components/screen-error';
import { StatusPill } from '@/components/status-pill';
import { fontSize, lineHeight, spacing, type AppThemeColors } from '@/constants/theme';
import { listNotifications, markNotificationsRead, markAllNotificationsRead } from '@/db';
import type { AppNotification } from '@/db/notifications';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { formatRelative } from '@/lib/format';

/**
 * `S-01` Notification Center. Recipient-scoped by RLS; the only write is marking
 * read. Tapping a row opens the dose record it refers to. In-app only — there is
 * no messaging surface here (docs/specs/sprint-4.md).
 */
export default function NotificationsScreen() {
  const { ready, user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loader = useCallback(() => listNotifications(), []);
  const { state, refreshing, reload } = useAsyncData(loader);

  if (!ready) return <LoadingScreen message="Starting ElderCare+…" />;
  if (!user) return <Redirect href="/sign-in" />;

  if (state.status === 'loading') return <LoadingScreen message="Loading notifications…" />;
  if (state.status === 'error') {
    return (
      <ScreenError
        title="Notifications"
        showBack
        safeBottom
        message={state.message}
        onRetry={reload}
      />
    );
  }

  const notifications = state.data;
  const unread = notifications.filter((notification) => notification.readAt === null);

  async function openNotification(
    id: string,
    targetTable: AppNotification['targetTable'],
    targetId: string | null,
  ) {
    try {
      if (!notifications.find((n) => n.id === id)?.readAt) await markNotificationsRead([id]);
    } catch {
      // Marking read is best-effort; opening the record must still work.
    }
    if (!targetId || !targetTable) {
      await reload();
      return;
    }
    if (targetTable === 'dose_events') {
      if (user?.role === 'caregiver') router.push(`/caregiver/dose?id=${targetId}`);
      else if (user?.role === 'elder') router.push(`/elder/dose?id=${targetId}`);
      else await reload();
      return;
    }
    if (targetTable === 'appointments') {
      // The appointment detail routes land with the Sprint 7 screens; until then the
      // reminder opens the appointment list for the viewer's role.
      if (user?.role === 'caregiver') router.push('/caregiver/calendar');
      else if (user?.role === 'elder') router.push('/elder/calendar');
      else await reload();
      return;
    }
    // A stock alert about a medicine.
    if (user?.role === 'caregiver') router.push(`/caregiver/med?id=${targetId}`);
    else if (user?.role === 'elder') router.push('/elder/meds');
    else await reload();
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      await reload();
    } catch {
      await reload();
    }
  }

  return (
    <Screen
      title="Notifications"
      subtitle={`Unread: ${unread.length}`}
      showBack
      safeBottom
      onRefresh={reload}
      refreshing={refreshing}
    >
      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Dose confirmations, stock alerts and appointment reminders appear here."
        />
      ) : (
        <>
          {unread.length > 0 ? (
            <Button
              label="Mark all read"
              variant="secondary"
              onPress={() => void markAllRead()}
              accessibilityHint="Marks every unread notification as read"
            />
          ) : null}

          {notifications.map((notification) => {
            const status = notificationPresentation[notification.eventType];
            const isUnread = notification.readAt === null;
            return (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                accessibilityLabel={`${isUnread ? 'Unread' : 'Read'}, ${status.label}, ${formatRelative(notification.createdAt)}`}
                accessibilityHint="Opens the related record"
                onPress={() =>
                  void openNotification(
                    notification.id,
                    notification.targetTable,
                    notification.targetId,
                  )
                }
                android_ripple={{ color: colors.border }}
              >
                <Card>
                  <View style={styles.row}>
                    <Text style={[styles.title, isUnread ? styles.unreadTitle : null]}>
                      {status.label}
                    </Text>
                    <StatusPill presentation={status} />
                  </View>
                  <Text style={styles.meta}>
                    {isUnread ? 'Unread' : 'Read'} · {formatRelative(notification.createdAt)}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}

      <Text style={styles.note}>
        Notifications stay in the app. ElderCare+ does not send medical detail by message.
      </Text>
    </Screen>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
    },
    title: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.body,
      fontWeight: '600',
      lineHeight: lineHeight.body,
    },
    unreadTitle: {
      fontWeight: '700',
    },
    meta: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
    note: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: lineHeight.caption,
    },
  });
}
