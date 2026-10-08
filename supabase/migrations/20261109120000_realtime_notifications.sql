-- Checking fix: publish `notifications` for Realtime.
--
-- The family device mirror (`useHelpRequestNotifications`, docs/specs/sprint-8.md OD4)
-- subscribes to `postgres_changes` on `public.notifications` and presents a local device
-- notification for each `help_request_*` event. The Sprint 4 and Sprint 8 Realtime
-- migrations published only `dose_events` and `help_requests`, so that subscription never
-- received anything and the device mirror silently did nothing.
--
-- This adds `notifications` to the `supabase_realtime` publication. Realtime applies RLS
-- per subscriber, so an account only ever receives its own notification rows; the in-app
-- notification centre remains the source of truth. No new column, table or grant is added,
-- and the existing `revoke`/`grant select` on `notifications` is unchanged.
--
-- Idempotent: re-running is a no-op when the table is already published.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
