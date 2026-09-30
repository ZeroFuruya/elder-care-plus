import { notificationEventTypeSchema, type NotificationEventType } from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

/**
 * In-app notifications (docs/specs/sprint-4.md). Reads are recipient-scoped by
 * RLS (`recipient_id = auth.uid()`); the only writes are the two guarded
 * read-state RPCs. There is no send path from the client.
 */

const NOTIFICATION_COLUMNS =
  'id, recipient_id, elder_id, event_type, target_table, target_id, created_at, read_at' as const;

interface NotificationRow {
  id: string;
  recipient_id: string;
  elder_id: string | null;
  event_type: string;
  target_table: string | null;
  target_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface AppNotification {
  id: string;
  elderId: string | null;
  eventType: NotificationEventType;
  targetId: string | null;
  createdAt: string;
  readAt: string | null;
}

function toNotification(row: NotificationRow): AppNotification {
  const parsed = notificationEventTypeSchema.safeParse(row.event_type);
  return {
    id: row.id,
    elderId: row.elder_id,
    eventType: parsed.success ? parsed.data : 'dose_confirmed',
    targetId: row.target_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<NotificationRow[]>();

  if (error) throw new Error('Could not load the notifications.');
  return data.map(toNotification);
}

/** Unread count for the dashboard summary. `head` means no rows travel. */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await getSupabase()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationsRead(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await getSupabase().rpc('mark_notifications_read', { p_ids: ids });
  if (error) throw new Error('Could not update the notifications.');
  return typeof data === 'number' ? data : 0;
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await getSupabase().rpc('mark_all_notifications_read');
  if (error) throw new Error('Could not update the notifications.');
  return typeof data === 'number' ? data : 0;
}
