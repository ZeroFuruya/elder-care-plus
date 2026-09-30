-- Sprint 4: publish dose_events for Realtime.
--
-- The caregiver dashboard refreshes through a Realtime subscription on the
-- elder's `dose_events` (docs/specs/sprint-4.md, `C-01`; acceptance criterion 14),
-- with an explicit focus/refresh fallback. RLS still scopes every delivered row,
-- so a caregiver only receives occurrences they may read.
--
-- Idempotent: the `supabase_realtime` publication exists on Supabase, and the
-- table may already be a member from a previous run.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'dose_events'
    ) then
      alter publication supabase_realtime add table public.dose_events;
    end if;
  end if;
end $$;
