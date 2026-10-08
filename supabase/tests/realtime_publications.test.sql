-- Realtime publication prerequisites (pgTAP). Run with: npx supabase test db
--
-- The app's live-refresh and device-mirror paths depend on tables being members of the
-- `supabase_realtime` publication:
--   * `dose_events`  -> the caregiver dashboard refresh (Sprint 4, C-01);
--   * `help_requests` -> the circle's help screens refresh (Sprint 8);
--   * `notifications` -> the family/caregiver device mirror (Sprint 8 OD4, added by the
--     checking fix `20261109120000_realtime_notifications.sql`).
--
-- This file exists because a missing publication membership fails silently in the client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(3);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dose_events'
  ),
  'dose_events is published for Realtime');

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'help_requests'
  ),
  'help_requests is published for Realtime');

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ),
  'notifications is published for Realtime (device mirror)');

select * from finish();
rollback;
