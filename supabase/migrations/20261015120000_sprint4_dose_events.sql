-- Sprint 4: the daily adherence loop (Flow C).
--
-- The dose occurrences, the elder's one guarded confirmation, the atomic stock
-- decrement, the server-only missed transition and the in-app notifications
-- behind `E-01`/`E-03`/`E-04`/`V-03`, `C-01`/`C-05`, `S-01` and the read-only
-- family view (docs/specs/sprint-4.md).
--
-- Read these decisions before the code:
--
--   * DST policy lives in `local_dose_timestamp`. The spec's formula is
--     `(local_date + time_of_day) AT TIME ZONE timezone`. A **nonexistent**
--     local time (spring forward) makes the round trip land on a different wall
--     clock, so the function returns NULL and generation skips that occurrence.
--     An **ambiguous** local time (fall back) has two instants; the function
--     returns the earlier one, as the spec requires. The ambiguity probe assumes
--     the one-hour DST step the spec's examples use; a zone with a different step
--     simply keeps PostgreSQL's own choice instead of the earlier instant.
--   * `dose_events` is the idempotency anchor: unique `(schedule_id,
--     scheduled_at)`. Generation is `insert ... on conflict do nothing`, so a
--     concurrent or repeated run cannot create a second occurrence. `client_key`
--     is traceability only and deliberately carries no unique index (it would let
--     one dose's key block a different dose).
--   * The confirmation is **one conditional update** whose predicate carries the
--     due window, the grace period, the active state and `elder_id = auth.uid()`.
--     Nothing about the decision is left to the client. A loser of the race
--     updates nothing and falls through to the re-read branch.
--   * The stock decrement is a **second conditional update** with the same shape
--     (active batch, unexpired, unit match, enough quantity). It updates zero rows
--     when any of those fail, and a zero-row update writes **no**
--     `inventory_transactions` row — the confirmation still stands and the reason
--     is recorded. The partial unique index on `(source_dose_event_id)` where
--     `reason = 'dose_confirmed'` makes a double decrement impossible even if a
--     retry somehow re-entered.
--   * A miss is settled in two places only: `transition_missed_doses` (server
--     job) and `confirm_dose` when it finds a lapsed dose. Both write the same
--     audit row and notify once; the notification unique index and the
--     `missed_at is null` predicate make repeats no-ops.
--   * `transition_missed_doses` is **never** granted to a client, per the spec's
--     fallback rule. If `pg_cron` cannot be scheduled at apply time the migration
--     warns instead of failing; shown-missed still derives on screen and is
--     settled by `confirm_dose`, and the proactive notification is then a
--     documented limitation.
--   * **Sprint 3's binding hand-off is closed here by triggers.** Sprint 3 says
--     "on a schedule change, future not-yet-due generated occurrences are
--     cancelled (never deleted)" and locks "medicine, schedule and batch edits
--     affect future occurrences only". That obligation needs `dose_events`, so it
--     lands in this migration: two `AFTER INSERT OR UPDATE` triggers call
--     `reconcile_dose_events_for_medication`, which cancels future not-yet-due
--     occurrences that no longer match their schedule, refreshes the plan fields
--     on the ones that survive, and regenerates the open window. Triggers rather
--     than edits to the Sprint 3 RPC bodies keep one source of truth and cover
--     every write path, including the ones a later sprint adds.
--   * Cancelling a *future projection* writes no audit row beyond the one the
--     plan edit itself already wrote. `audit_events` is scoped to the actor, the
--     elder and the manager, and the cancelled occurrences are derived data, not
--     medical history (which is never deleted: `cancelled_at` is a timestamp).
--   * Family members read the base tables, including `dose_events`, through
--     `can_view_profile`, by the owner's 2026-09-30 decision (open question 6:
--     full plan visibility). No `family_*_summary` view exists; the boundary is
--     proven by row-level RLS tests.
--   * Authorization failures are indistinguishable from a missing id: an
--     unrelated caller and a caller naming a nonexistent dose get the same
--     `42501`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.dose_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.medication_schedules (id) on delete restrict,
  elder_id uuid not null references public.profiles (id) on delete restrict,
  medication_id uuid not null references public.medications (id) on delete restrict,
  scheduled_at timestamptz not null,
  scheduled_local_date date not null,
  dose_quantity numeric(10, 3) not null check (dose_quantity > 0),
  dose_unit text not null check (length(btrim(dose_unit)) > 0),
  grace_minutes smallint not null check (grace_minutes between 5 and 120),
  timezone text not null check (length(btrim(timezone)) > 0),
  taken_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete restrict,
  client_key uuid,
  missed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  -- `taken` and `missed` are terminal and mutually exclusive.
  constraint dose_events_not_taken_and_missed
    check (not (taken_at is not null and missed_at is not null)),
  -- A confirmation always names its confirmer.
  constraint dose_events_taken_has_confirmer
    check (taken_at is null or confirmed_by is not null)
);

comment on table public.dose_events is
  'One row per schedule occurrence. Stores facts only (taken_at/missed_at/cancelled_at); upcoming/due/missed are otherwise derived. Unique (schedule_id, scheduled_at) is the DB-level idempotency anchor.';

-- The idempotency anchor stated by Sprint 3's normative hand-off.
create unique index dose_events_occurrence_key
  on public.dose_events (schedule_id, scheduled_at);

create index dose_events_by_elder_time on public.dose_events (elder_id, scheduled_at);
create index dose_events_by_medication on public.dose_events (medication_id);

-- The minimal decrement ledger the checking needs; the rest of Flow D is Sprint 5.
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.medicine_batches (id) on delete restrict,
  delta numeric(10, 3) not null check (delta <> 0),
  reason text not null check (reason in ('dose_confirmed')),
  source_dose_event_id uuid references public.dose_events (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.inventory_transactions is
  'Append-only stock ledger. This sprint writes only the automatic `dose_confirmed` decrement; manual adjustments with a reason are Sprint 5.';

create index inventory_transactions_by_batch on public.inventory_transactions (batch_id, created_at desc);

-- At most one automatic decrement per dose, even across retries.
create unique index inventory_transactions_dose_decrement_key
  on public.inventory_transactions (source_dose_event_id)
  where reason = 'dose_confirmed';

create or replace function public.inventory_transactions_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'inventory_transactions is append-only (% is not permitted)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger inventory_transactions_no_update_or_delete
  before update or delete on public.inventory_transactions
  for each row execute function public.inventory_transactions_append_only();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  elder_id uuid references public.profiles (id) on delete restrict,
  event_type text not null check (event_type in ('dose_confirmed', 'dose_missed')),
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.notifications is
  'In-app notifications. One row per event per recipient; read state is the only client write, through RPCs.';

-- One notification per event per recipient: a repeated transition cannot notify twice.
create unique index notifications_event_key
  on public.notifications (recipient_id, event_type, target_id);

create index notifications_by_recipient on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.batch_elder_id(p_batch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.medication_elder_id(medication_id)
  from public.medicine_batches
  where id = p_batch_id;
$$;

comment on function public.batch_elder_id(uuid) is
  'Owner elder of a batch, for the inventory_transactions RLS policy. Granted to authenticated because policy expressions run as the querying role.';

-- The local occurrence -> UTC instant conversion, with the DST policy above.
create or replace function public.local_dose_timestamp(
  p_local_date date,
  p_time time,
  p_timezone text
)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_local timestamp;
  v_utc timestamptz;
  v_earlier timestamptz;
begin
  v_local := p_local_date + p_time;
  v_utc := v_local at time zone p_timezone;

  -- Nonexistent local time (spring forward): the round trip lands elsewhere.
  if (v_utc at time zone p_timezone) <> v_local then
    return null;
  end if;

  -- Ambiguous local time (fall back): if one hour earlier still maps back to the
  -- same wall clock, an earlier instant exists and is the documented choice.
  v_earlier := v_utc - interval '1 hour';
  if (v_earlier at time zone p_timezone) = v_local then
    return v_earlier;
  end if;

  return v_utc;
end;
$$;

comment on function public.local_dose_timestamp(date, time, text) is
  'A schedule slot in its IANA zone as a UTC instant. NULL for a spring-forward gap; the earlier instant for a fall-back overlap.';

-- The dose snapshot the audit stores, so confirm/miss rows are comparable.
create or replace function public.dose_event_audit_summary(p_row public.dose_events)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'scheduled_at', p_row.scheduled_at,
    'scheduled_local_date', p_row.scheduled_local_date,
    'medication_id', p_row.medication_id,
    'dose_quantity', p_row.dose_quantity,
    'dose_unit', p_row.dose_unit,
    'grace_minutes', p_row.grace_minutes,
    'taken_at', p_row.taken_at,
    'missed_at', p_row.missed_at,
    'cancelled_at', p_row.cancelled_at
  );
$$;

-- One notification per active manager of the elder, deduplicated by the unique
-- index. Zero managers is a normal outcome, never an error.
create or replace function public.notify_dose_event(
  p_event_type text,
  p_elder_id uuid,
  p_target_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.notifications (recipient_id, elder_id, event_type, target_table, target_id)
  select cl.member_id, p_elder_id, p_event_type, 'dose_events', p_target_id
  from public.care_links cl
  where cl.elder_id = p_elder_id
    and cl.member_role = 'caregiver'
    and cl.access_level = 'manage'
    and cl.status = 'active'
  on conflict (recipient_id, event_type, target_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notify_dose_event(text, uuid, uuid) is
  'Inserts one notifications row per active manager of the elder. Internal: called only from the dose RPCs and the reconcile trigger.';

-- Pure generation. No authorization and no cap: callers do that. Idempotent by
-- the occurrence key, so a concurrent run is safe without a lock.
create or replace function public.generate_dose_events_for(
  p_elder_id uuid,
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_elder_id is null or p_from is null or p_to is null or p_to < p_from then
    return 0;
  end if;

  insert into public.dose_events (
    schedule_id, elder_id, medication_id, scheduled_at, scheduled_local_date,
    dose_quantity, dose_unit, grace_minutes, timezone
  )
  select
    s.id,
    m.elder_id,
    m.id,
    v.scheduled_at,
    d.local_date,
    m.dose_quantity,
    m.dose_unit,
    s.grace_minutes,
    s.timezone
  from public.medications m
  join public.medication_schedules s
    on s.medication_id = m.id and s.is_active
  cross join lateral (
    select (p_from + offset_days)::date as local_date
    from generate_series(0, (p_to - p_from)) as offset_days
  ) d
  cross join lateral (
    select public.local_dose_timestamp(d.local_date, s.time_of_day, s.timezone) as scheduled_at
  ) v
  where m.elder_id = p_elder_id
    and m.is_active
    and d.local_date >= m.start_date
    and (m.end_date is null or d.local_date <= m.end_date)
    and extract(dow from d.local_date)::smallint = any (s.days_of_week)
    and v.scheduled_at is not null
  on conflict (schedule_id, scheduled_at) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.generate_dose_events_for(uuid, date, date) is
  'Creates the missing occurrences for one elder in one window. Internal: the client path is ensure_dose_events, which caps the window.';

-- Cancels future, not-yet-due occurrences whose slot no longer matches the
-- schedule. With p_days NULL it cancels every future occurrence (deactivation).
create or replace function public.cancel_future_dose_events(
  p_schedule_id uuid,
  p_days smallint[] default null,
  p_time time default null,
  p_timezone text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.dose_events
     set cancelled_at = now()
   where schedule_id = p_schedule_id
     and taken_at is null
     and missed_at is null
     and cancelled_at is null
     and scheduled_at > now()
     and (
       p_days is null
       or not (
         extract(dow from scheduled_local_date)::smallint = any (p_days)
         and scheduled_at = public.local_dose_timestamp(scheduled_local_date, p_time, p_timezone)
       )
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.cancel_future_dose_events(uuid, smallint[], time, text) is
  'Stamps cancelled_at on future not-yet-due occurrences that no longer match their schedule. Never deletes. Internal.';

-- Reconciles one medicine's open window after a plan edit: cancel what no longer
-- matches, refresh the plan fields on the survivors, regenerate what is missing.
create or replace function public.reconcile_dose_events_for_medication(p_medication_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_created integer := 0;
begin
  select elder_id into v_elder from public.medications where id = p_medication_id;
  if v_elder is null then
    return 0;
  end if;

  -- 1. Cancel future occurrences that the current plan no longer produces.
  update public.dose_events d
     set cancelled_at = now()
    from public.medication_schedules s
   where d.schedule_id = s.id
     and s.medication_id = p_medication_id
     and d.taken_at is null
     and d.missed_at is null
     and d.cancelled_at is null
     and d.scheduled_at > now()
     and (
       not s.is_active
       or not exists (
         select 1 from public.medications m
         where m.id = p_medication_id and m.is_active
       )
       or not (
         extract(dow from d.scheduled_local_date)::smallint = any (s.days_of_week)
         and d.scheduled_at = public.local_dose_timestamp(d.scheduled_local_date, s.time_of_day, s.timezone)
       )
     );

  -- 2. Refresh the plan fields on the future occurrences that survive, so a dose
  --    or grace edit takes effect today rather than silently leaving a stale one.
  update public.dose_events d
     set dose_quantity = m.dose_quantity,
         dose_unit = m.dose_unit,
         grace_minutes = s.grace_minutes,
         timezone = s.timezone
    from public.medications m, public.medication_schedules s
   where d.medication_id = p_medication_id
     and m.id = d.medication_id
     and s.id = d.schedule_id
     and d.taken_at is null
     and d.missed_at is null
     and d.cancelled_at is null
     and d.scheduled_at > now();

  -- 3. Regenerate, but only for a plan that is meant to produce doses.
  if exists (select 1 from public.medications where id = p_medication_id and is_active) then
    v_created := public.generate_dose_events_for(v_elder, current_date, current_date + 3);
  end if;

  return v_created;
end;
$$;

comment on function public.reconcile_dose_events_for_medication(uuid) is
  'Closes Sprint 3''s hand-off: a plan edit affects future occurrences only. Internal; called from the reconcile triggers.';

-- Trigger bodies. A `trigger`-returning function cannot be invoked directly, so
-- granting EXECUTE to authenticated (which the DML role needs for the trigger to
-- fire) exposes nothing callable.
create or replace function public.reconcile_schedule_dose_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.reconcile_dose_events_for_medication(new.medication_id);
  return null;
end;
$$;

create trigger medication_schedules_reconcile_dose_events
  after insert or update on public.medication_schedules
  for each row execute function public.reconcile_schedule_dose_events();

create or replace function public.reconcile_medication_dose_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.reconcile_dose_events_for_medication(new.id);
  return null;
end;
$$;

create trigger medications_reconcile_dose_events
  after insert or update on public.medications
  for each row execute function public.reconcile_medication_dose_events();

-- ---------------------------------------------------------------------------
-- RLS: default deny, policy-scoped reads, no direct write grants.
-- ---------------------------------------------------------------------------

alter table public.dose_events enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.notifications enable row level security;

create policy dose_events_select on public.dose_events
  for select to authenticated
  using (public.can_view_profile(elder_id));

create policy inventory_transactions_select on public.inventory_transactions
  for select to authenticated
  using (public.can_view_profile(public.batch_elder_id(batch_id)));

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs. All security definer.
-- ---------------------------------------------------------------------------

-- The elder's only write. Never takes an elder id: the row decides.
create or replace function public.confirm_dose(
  p_dose_event_id uuid,
  p_client_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.dose_events;
  v_batch public.medicine_batches;
  v_active public.medicine_batches;
  v_tx_id uuid;
  v_stock text;
  v_lapsed_at timestamptz;
begin
  if p_dose_event_id is null then
    raise exception 'a dose is required' using errcode = 'check_violation';
  end if;

  -- A signed-out caller and a deactivated account are rejected up front, so a
  -- deactivated elder cannot confirm through a still-valid JWT.
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deactivated_at is null
  ) then
    raise exception 'this dose is not available to you'
      using errcode = 'insufficient_privilege';
  end if;

  -- One atomic conditional update. The due window, the grace period, the active
  -- state and the owner check are all in the predicate.
  update public.dose_events d
     set taken_at = now(),
         confirmed_by = auth.uid(),
         client_key = coalesce(d.client_key, p_client_key)
   where d.id = p_dose_event_id
     and d.elder_id = auth.uid()
     and d.taken_at is null
     and d.missed_at is null
     and d.cancelled_at is null
     and d.scheduled_at <= now()
     and now() < d.scheduled_at + make_interval(mins => d.grace_minutes)
  returning * into v_row;

  if found then
    -- Decrement the matching active batch, atomically and conditionally.
    update public.medicine_batches b
       set quantity = b.quantity - v_row.dose_quantity
     where b.medication_id = v_row.medication_id
       and b.is_active
       and b.expiry_date >= now()::date
       and btrim(b.unit) = btrim(v_row.dose_unit)
       and b.quantity >= v_row.dose_quantity
    returning * into v_batch;

    if found then
      v_stock := 'decremented';
      insert into public.inventory_transactions (
        batch_id, delta, reason, source_dose_event_id, actor_id
      ) values (
        v_batch.id, -v_row.dose_quantity, 'dose_confirmed', v_row.id, auth.uid()
      )
      returning id into v_tx_id;
    else
      v_tx_id := null;
      -- Classify why the decrement did not happen, for the caregiver.
      select * into v_active
      from public.medicine_batches
      where medication_id = v_row.medication_id and is_active;

      if found then
        if btrim(v_active.unit) <> btrim(v_row.dose_unit) then
          v_stock := 'unit_mismatch';
        elsif v_active.expiry_date < now()::date then
          v_stock := 'inactive_or_expired';
        elsif v_active.quantity < v_row.dose_quantity then
          v_stock := 'insufficient';
        else
          v_stock := 'no_batch';
        end if;
      elsif exists (
        select 1 from public.medicine_batches where medication_id = v_row.medication_id
      ) then
        -- Batches exist but none is active.
        v_stock := 'inactive_or_expired';
      else
        v_stock := 'no_batch';
      end if;
    end if;

    insert into public.audit_events (
      actor_id, elder_id, action, target_table, target_id, after_summary
    ) values (
      auth.uid(), v_row.elder_id, 'dose.confirmed', 'dose_events', v_row.id,
      public.dose_event_audit_summary(v_row)
        || jsonb_build_object('stock', v_stock, 'inventory_transaction_id', v_tx_id)
    );

    -- Zero managers is fine: the confirmation must never roll back.
    perform public.notify_dose_event('dose_confirmed', v_row.elder_id, v_row.id);

    return jsonb_build_object(
      'status', 'taken',
      'duplicate', false,
      'stock', v_stock,
      'taken_at', v_row.taken_at
    );
  end if;

  -- Nothing updated. Re-read scoped to the caller so a foreign id leaks nothing.
  select * into v_row
  from public.dose_events
  where id = p_dose_event_id and elder_id = auth.uid();

  if not found then
    raise exception 'this dose is not available to you'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.taken_at is not null then
    return jsonb_build_object(
      'status', 'taken', 'duplicate', true, 'stock', 'unchanged', 'taken_at', v_row.taken_at
    );
  end if;

  if v_row.cancelled_at is not null then
    return jsonb_build_object('status', 'cancelled', 'duplicate', false);
  end if;

  if v_row.missed_at is not null then
    return jsonb_build_object('status', 'missed', 'duplicate', false);
  end if;

  -- Not yet settled but past the grace period: settle it here rather than lie.
  if now() >= v_row.scheduled_at + make_interval(mins => v_row.grace_minutes) then
    update public.dose_events
       set missed_at = scheduled_at + make_interval(mins => grace_minutes)
     where id = p_dose_event_id
       and elder_id = auth.uid()
       and taken_at is null
       and missed_at is null
       and cancelled_at is null
    returning * into v_row;

    if found then
      insert into public.audit_events (
        actor_id, elder_id, action, target_table, target_id, after_summary
      ) values (
        auth.uid(), v_row.elder_id, 'dose.missed', 'dose_events', v_row.id,
        public.dose_event_audit_summary(v_row)
          || jsonb_build_object('settled_by', 'confirm_dose')
      );
      perform public.notify_dose_event('dose_missed', v_row.elder_id, v_row.id);
    end if;

    return jsonb_build_object('status', 'missed', 'duplicate', false);
  end if;

  return jsonb_build_object('status', 'upcoming', 'duplicate', false);
end;
$$;

comment on function public.confirm_dose(uuid, uuid) is
  'The elder''s only write. One conditional update settles taken_at, then one conditional update decrements the active batch; a lost race returns duplicate.';

-- Pure generation, with authorization and a capped window.
create or replace function public.ensure_dose_events(
  p_elder_id uuid,
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_elder_id is null or p_from is null or p_to is null then
    raise exception 'an elder and a date window are required' using errcode = 'check_violation';
  end if;

  -- Fail closed: only the elder, their manager or an active member of the circle.
  if not (
    public.is_elder_self(p_elder_id)
    or public.is_manager_of(p_elder_id)
    or public.is_active_member_of(p_elder_id)
  ) then
    raise exception 'this care circle is not available to you'
      using errcode = 'insufficient_privilege';
  end if;

  if p_from < current_date - 1 or p_to > current_date + 3 or (p_to - p_from) > 3 then
    raise exception 'doses can only be generated for a four day window around today'
      using errcode = 'check_violation';
  end if;

  return public.generate_dose_events_for(p_elder_id, p_from, p_to);
end;
$$;

comment on function public.ensure_dose_events(uuid, date, date) is
  'Creates missing occurrences for the caller''s elder in [today-1, today+3]. Writes no notification, so it cannot be used for spam.';

-- Server-only. Never client-callable.
create or replace function public.transition_missed_doses()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    update public.dose_events
       set missed_at = scheduled_at + make_interval(mins => grace_minutes)
     where taken_at is null
       and missed_at is null
       and cancelled_at is null
       and now() >= scheduled_at + make_interval(mins => grace_minutes)
    returning id, elder_id, missed_at
  loop
    insert into public.audit_events (
      actor_id, elder_id, action, target_table, target_id, after_summary
    ) values (
      null, v_row.elder_id, 'dose.missed', 'dose_events', v_row.id,
      jsonb_build_object(
        'missed_at', v_row.missed_at,
        'settled_by', 'transition_missed_doses'
      )
    );

    -- Unique (recipient_id, event_type, target_id) makes a repeat a no-op.
    perform public.notify_dose_event('dose_missed', v_row.elder_id, v_row.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.transition_missed_doses() is
  'Server-only missed transition. Revoked from public, anon and authenticated; runs from pg_cron every five minutes.';

create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid()
     and read_at is null
     and id = any (coalesce(p_ids, '{}'::uuid[]));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid()
     and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- The missed-dose job. Enabling pg_cron and scheduling it must not make the
-- migration fail: if either is refused, warn and continue (spec fallback).
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'transition-missed-doses',
    '*/5 * * * *',
    'select public.transition_missed_doses()'
  );
exception
  when others then
    raise warning 'pg_cron missed-dose job not scheduled: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.dose_events, public.inventory_transactions, public.notifications
  from public, anon;
revoke insert, update, delete on public.dose_events, public.inventory_transactions,
  public.notifications from authenticated;
grant select on public.dose_events, public.inventory_transactions, public.notifications
  to authenticated;

-- Supabase's default privileges grant EXECUTE to `authenticated`, so revoke from
-- all three roles first and grant back only the intended set.
revoke execute on function
  public.inventory_transactions_append_only(),
  public.batch_elder_id(uuid),
  public.local_dose_timestamp(date, time, text),
  public.dose_event_audit_summary(public.dose_events),
  public.notify_dose_event(text, uuid, uuid),
  public.generate_dose_events_for(uuid, date, date),
  public.cancel_future_dose_events(uuid, smallint[], time, text),
  public.reconcile_dose_events_for_medication(uuid),
  public.reconcile_schedule_dose_events(),
  public.reconcile_medication_dose_events(),
  public.confirm_dose(uuid, uuid),
  public.ensure_dose_events(uuid, date, date),
  public.transition_missed_doses(),
  public.mark_notifications_read(uuid[]),
  public.mark_all_notifications_read()
  from public, anon, authenticated;

-- Client API.
grant execute on function
  public.batch_elder_id(uuid),
  public.confirm_dose(uuid, uuid),
  public.ensure_dose_events(uuid, date, date),
  public.mark_notifications_read(uuid[]),
  public.mark_all_notifications_read()
  to authenticated;

-- Trigger functions must be executable by the DML role for the trigger to fire;
-- a `trigger`-returning function cannot be called directly.
grant execute on function
  public.reconcile_schedule_dose_events(),
  public.reconcile_medication_dose_events()
  to authenticated;

-- `transition_missed_doses` stays revoked from every client role on purpose.
