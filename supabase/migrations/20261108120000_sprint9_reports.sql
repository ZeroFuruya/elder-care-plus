-- Sprint 9: reports and history browsing.
--
-- docs/specs/sprint-9.md as a migration. Every history screen is a read over
-- tables that already have RLS and select grants (dose_events,
-- inventory_transactions, audit_events); this file adds only the one
-- server-side aggregate the reports need, plus its supporting index.
--
-- Rules respected here (AGENTS.md hard rules):
--   * RLS on every table, default deny. This function is security definer, so
--     its guard is the whole authorization boundary; it writes nothing.
--   * Medical history is never hard-deleted and is never rewritten by a read.
--   * Status is a set of facts (taken_at/missed_at/cancelled_at); the report
--     never derives "missed" from the clock.
--
-- Filename ordering: the timestamp is a monotonic ordering token (not a
-- calendar date) and sorts after the applied Sprint 8 migration 20261107120000.

-- ---------------------------------------------------------------------------
-- A. Supporting index. The report filters by elder and groups by the immutable
-- local calendar date captured at generation; the existing (elder_id,
-- scheduled_at) index does not serve that predicate.
-- ---------------------------------------------------------------------------

create index dose_events_by_elder_local_date
  on public.dose_events (elder_id, scheduled_local_date);

comment on index public.dose_events_by_elder_local_date is
  'Supports get_adherence_report: filter by elder, group by scheduled_local_date.';

-- ---------------------------------------------------------------------------
-- B. The adherence report. One read RPC across all three roles: the RPC returns
-- counts and dates only, so a connected family member can be given the summary
-- without any dose id, medication, or timestamp.
-- ---------------------------------------------------------------------------

create or replace function public.get_adherence_report(
  p_elder_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days jsonb;
  v_taken integer;
  v_missed integer;
  v_open integer;
  v_settled integer;
  v_expected integer;
  v_percent integer;
begin
  -- Authorization. security definer bypasses RLS, so this is the boundary:
  -- the caller's own account must be active, and the caller must be the elder
  -- or an active member of the elder's circle. Forbidden and missing are
  -- indistinguishable.
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deactivated_at is null
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if not (public.is_elder_self(p_elder_id) or public.is_active_member_of(p_elder_id)) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  -- Bounds: 1..366 inclusive dates.
  if p_from is null or p_to is null then
    raise exception 'a report range is required' using errcode = 'check_violation';
  end if;

  if p_from > p_to or (p_to - p_from) > 365 then
    raise exception 'the report range must be between 1 and 366 days'
      using errcode = 'check_violation';
  end if;

  with day_series as (
    select d::date as local_date
    from generate_series(p_from, p_to, interval '1 day') as d
  ),
  facts as (
    -- A cancelled occurrence is excluded from every count; a row cannot be both
    -- taken and missed (dose_events_not_taken_and_missed), and "missed" is only
    -- ever the persisted missed_at fact, never derived from the clock.
    select
      de.scheduled_local_date as local_date,
      count(*) filter (where de.taken_at is not null) as taken,
      count(*) filter (where de.missed_at is not null) as missed,
      count(*) filter (where de.taken_at is null and de.missed_at is null) as open
    from public.dose_events de
    where de.elder_id = p_elder_id
      and de.cancelled_at is null
      and de.scheduled_local_date between p_from and p_to
    group by de.scheduled_local_date
  ),
  combined as (
    select
      ds.local_date,
      coalesce(f.taken, 0)::int as taken,
      coalesce(f.missed, 0)::int as missed,
      coalesce(f.open, 0)::int as open
    from day_series ds
    left join facts f on f.local_date = ds.local_date
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(c.local_date, 'YYYY-MM-DD'),
        'taken', c.taken,
        'missed', c.missed,
        'open', c.open,
        'settled', c.taken + c.missed,
        'expected', c.taken + c.missed + c.open
      ) order by c.local_date
    ), '[]'::jsonb),
    coalesce(sum(c.taken), 0)::int,
    coalesce(sum(c.missed), 0)::int,
    coalesce(sum(c.open), 0)::int
  into v_days, v_taken, v_missed, v_open
  from combined c;

  v_settled := v_taken + v_missed;
  v_expected := v_settled + v_open;
  v_percent := case
    when v_settled = 0 then 0
    else round(100.0 * v_taken / v_settled)::int
  end;

  return jsonb_build_object(
    'from', to_char(p_from, 'YYYY-MM-DD'),
    'to', to_char(p_to, 'YYYY-MM-DD'),
    'days', v_days,
    'totals', jsonb_build_object(
      'taken', v_taken,
      'missed', v_missed,
      'open', v_open,
      'settled', v_settled,
      'expected', v_expected,
      'percent', v_percent
    )
  );
end;
$$;

comment on function public.get_adherence_report(uuid, date, date) is
  'Read-only adherence report (counts + dates only) for the elder or an active circle member.';

-- ---------------------------------------------------------------------------
-- C. Execute grants: the only new client API. Revoke the default PUBLIC grant
-- first, then hand execute to authenticated only.
-- ---------------------------------------------------------------------------

revoke execute on function public.get_adherence_report(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.get_adherence_report(uuid, date, date)
  to authenticated;
