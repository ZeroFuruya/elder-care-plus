import { useEffect } from 'react';

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

    const channel = client
      .channel(`caregiver-dose-events-${elderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dose_events', filter: `elder_id=eq.${elderId}` },
        () => onChange(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () =>
        onChange(),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [elderId, onChange]);
}
