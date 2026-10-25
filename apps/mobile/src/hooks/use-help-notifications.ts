import { notificationEventTypeSchema, notificationPresentation } from '@eldercare/shared';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { ensureNotificationPermission, presentHelpNotification } from '@/lib/device-notifications';
import { uniqueRealtimeTopic } from '@/lib/realtime-channel';
import { getSupabase, supabaseConfigError } from '@/supabase/client';

/** A short, safe device-notification body per help-request event. */
const HELP_EVENT_BODIES: Partial<Record<string, string>> = {
  help_request_created: 'The older adult has asked for help.',
  help_request_accepted: 'Someone in your circle is helping.',
  help_request_completed: 'A help request is now complete.',
  help_request_cancelled: 'A help request was withdrawn.',
};

/**
 * Device notifications for help requests (docs/specs/sprint-8.md, OD4).
 *
 * Subscribes to this account's `notifications` rows over Realtime (RLS-scoped, so only the
 * recipient's rows are delivered) and presents a local device notification for each
 * `help_request_*` event. The in-app notification centre remains the source of truth; this is the
 * device mirror the owner asked for. No remote push service is used.
 */
export function useHelpRequestNotifications(): void {
  useEffect(() => {
    if (supabaseConfigError) return;

    void ensureNotificationPermission();
    const client = getSupabase();

    // Each subscription takes its own topic: `client.channel(topic)` hands back an
    // existing channel for the same topic, and adding a listener to one that is
    // already subscribed throws (`lib/realtime-channel.ts`).
    let channel: RealtimeChannel | null = null;
    try {
      channel = client
        .channel(uniqueRealtimeTopic('family-help-requests'))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          (payload) => {
            const eventType = (payload.new as { event_type?: unknown }).event_type;
            if (typeof eventType !== 'string' || !eventType.startsWith('help_request_')) return;

            const parsed = notificationEventTypeSchema.safeParse(eventType);
            if (!parsed.success) return;

            void presentHelpNotification(
              notificationPresentation[parsed.data].label,
              HELP_EVENT_BODIES[parsed.data] ?? 'Open ElderCare+ to see the request.',
            );
          },
        )
        .subscribe();
    } catch {
      // Fails soft, like every other entry point of the device mirror: the in-app
      // notification centre is the source of truth, so Realtime being unavailable
      // must never take a screen down (docs/specs/sprint-8.md, OD4).
      channel = null;
    }

    return () => {
      if (channel) void client.removeChannel(channel);
    };
  }, []);
}
