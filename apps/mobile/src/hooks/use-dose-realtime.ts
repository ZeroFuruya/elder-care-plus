import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { uniqueRealtimeTopic } from '@/lib/realtime-channel';
import { getSupabase, supabaseConfigError } from '@/supabase/client';

/**
 * Realtime refresh for a caregiver's screen (docs/specs/sprint-4.md, `C-01`).
 *
 * Subscribes to the elder's `dose_events` and to this account's `notifications`
 * rows — both are RLS-scoped, so the channel can only ever deliver rows the
 * caregiver may read. `onChange` is called without arguments so the caller can
 * pass its own stable reload. A missing Realtime publication is not an error
 * here: the screens still reload on focus, so the caregiver never has to guess.
 */
export function useDoseRealtime(elderId: string | null, onChange: () => void): void {
  useEffect(() => {
    if (!elderId || supabaseConfigError) return;
    const client = getSupabase();

    // Each subscription takes its own topic: `client.channel(topic)` hands back an
    // existing channel for the same topic, and adding a listener to one that is
    // already subscribed throws (`lib/realtime-channel.ts`).
    let channel: RealtimeChannel | null = null;
    try {
      channel = client
        .channel(uniqueRealtimeTopic(`caregiver-dose-events-${elderId}`))
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'dose_events', filter: `elder_id=eq.${elderId}` },
          () => onChange(),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () =>
          onChange(),
        )
        .subscribe();
    } catch {
      // Fails soft: this is a convenience refresh. Every screen still reloads on
      // focus and on pull-to-refresh, so a Realtime failure never closes the app.
      channel = null;
    }

    return () => {
      if (channel) void client.removeChannel(channel);
    };
  }, [elderId, onChange]);
}
