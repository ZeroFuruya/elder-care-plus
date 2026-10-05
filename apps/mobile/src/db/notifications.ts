import {
  notificationEventTypeSchema,
  notificationTargetTableSchema,
  type NotificationEventType,
  type NotificationTargetTable,
} from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

/**
 * In-app notifications (docs/specs/sprint-4.md, extended by Sprints 5 and 7). Reads
 * are recipient-scoped by RLS (`recipient_id = auth.uid()`); the only writes are the
 * two guarded read-state RPCs. There is no send path from the client.
 *
 * `target_table` is carried through so the notification centre routes by the record
 * the event is about (a dose, a medicine, an appointment), not by the dose default.
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
  targetTable: NotificationTargetTable | null;
  targetId: string | null;
  createdAt: string;
  readAt: string | null;
}

/**
 * Map a row, or `null` when the database sends an event or target this client has no
 * presentation for. The database check constraint makes that unreachable in practice;
 * dropping the row is the safe behaviour, and `listNotifications` filters it rather
 * than coercing a stock alert into a dose event.
 */
function toNotification(row: NotificationRow): AppNotification | null {
  const event = notificationEventTypeSchema.safeParse(row.event_type);
  if (!event.success) return null;
  const target = notificationTargetTableSchema.safeParse(row.target_table);
  return {
    id: row.id,
    elderId: row.elder_id,
    eventType: event.data,
    targetTable: target.success ? target.data : null,
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
  return data.map(toNotification).filter((row): row is AppNotification => row !== null);
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
