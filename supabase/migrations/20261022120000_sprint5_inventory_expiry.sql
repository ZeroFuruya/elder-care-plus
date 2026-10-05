-- Sprint 5: inventory and expiry safety (Flow D).
--
-- Turns the stock/expiry facts Sprint 4 records into a safety workflow: expiry
-- warning windows, low/out-of-stock and needs-review alerts, a correct
-- suppression-and-resume path for dose generation, and manual stock adjustments
-- with a reason and an audit trail (docs/specs/sprint-5.md).
--
-- Read these decisions before the code:
--
--   * `needs_review` suppression applies only when a medicine HAS a batch but no
--     valid active batch remains (the active batch is expired, or its unit does
--     not match the dose unit). A medicine with no batch at all keeps reminding,
--     and quantity 0 only warns. See `medicine_suppresses_doses`.
--   * `generate_dose_events_for` keeps `(schedule_id, scheduled_at)` as the
--     idempotency anchor and does NOT reopen cancelled rows on its own. Resume is
--     `reconcile_dose_events_for_medication`'s job, which reopens only
--     `batch_invalid` future occurrences. This is why `cancel_reason` exists:
--     without it, a cancelled occurrence could never be told apart from a
--     schedule/plan cancellation and could never be safely resumed.
--   * A new trigger on `medicine_batches` wires batch changes into
--     reconciliation, mirroring the Sprint 4 medication/schedule triggers.
--     Sprint 3 predates that helper, so batches had no trigger before now.
--   * Alerts are per state transition, not per lifetime. The Sprint 4
--     `(recipient_id, event_type, target_id)` unique index cannot alert again
--     after low -> normal -> low, so `notifications` gains a `dedup_key`
--     carrying a per-medicine transition sequence.
--   * Only active caregiver managers are notified. Elders and family members
--     read no inventory-alert notification rows; the elder's plain-language
--     instruction is derived on the client. `notifications_select` stays
--     `recipient_id = auth.uid()`.
--   * `inventory_transactions` stays append-only. A correction is a new signed
--     row; a below-zero result is rejected, never silently clamped.

-- ---------------------------------------------------------------------------
-- A. Cancellation reasons, suppression and resume
-- ---------------------------------------------------------------------------

alter table public.dose_events
  add column cancel_reason text;

alter table public.dose_events
  add constraint dose_events_cancel_reason_check
  check (
    cancel_reason is null
    or cancel_reason in ('batch_invalid', 'schedule_changed', 'plan_deactivated')
  );

-- A reason only exists on a cancelled row; reopening clears both together.
alter table public.dose_events
  add constraint dose_events_cancel_reason_requires_cancel
  check (cancel_reason is null or cancelled_at is not null);

-- Was the plan (medicine or schedule) deactivated, or is this a slot edit?
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
     set cancelled_at = now(),
         cancel_reason = case
           when p_days is null then 'plan_deactivated'
           else 'schedule_changed'
         end
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

-- Does this medicine have a batch at all?
create or replace function public.medicine_has_any_batch(p_medication_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.medicine_batches where medication_id = p_medication_id
  );
$$;

comment on function public.medicine_has_any_batch(uuid) is
  'True when the medicine has at least one batch. Distinguishes "no batch" (batch optional, keeps reminding) from "has a batch". Internal.';

-- Does this medicine have an active batch usable for the dose: active,
-- unexpired, and in the dose's unit?
create or replace function public.medicine_has_valid_active_batch(p_medication_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.medicine_batches b
    join public.medications m on m.id = b.medication_id
    where b.medication_id = p_medication_id
      and b.is_active
      and b.expiry_date >= current_date
      and b.unit = m.dose_unit
  );
$$;

comment on function public.medicine_has_valid_active_batch(uuid) is
  'True when an active, unexpired batch matches the dose unit. Internal.';

-- The owner's binding suppression rule (2026-10-05). Never infer suppression
-- from a display status.
create or replace function public.medicine_suppresses_doses(p_medication_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.medicine_has_any_batch(p_medication_id)
     and not public.medicine_has_valid_active_batch(p_medication_id);
$$;

comment on function public.medicine_suppresses_doses(uuid) is
  'True only when a batch exists but no valid active batch remains: new occurrences are suppressed and future ones cancel as batch_invalid. Internal.';

-- Pure generation. No authorization and no cap: callers do that. Idempotent by
-- the occurrence key. A suppressed medicine produces nothing; cancelled rows are
-- reopened only by reconciliation, never by a bare insert.
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
    and not public.medicine_suppresses_doses(m.id)
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
  'Creates the missing occurrences for one elder in one window, skipping a suppressed medicine. Internal: the client path is ensure_dose_events, which caps the window.';

-- Reconciles one medicine's open window after any plan, schedule OR batch change:
-- suppress/resume by batch validity, cancel what no longer matches, refresh the
-- survivors, regenerate what is missing. This is the single resume path.
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

  -- 0. Batch validity. Suppress future occurrences while no valid active batch
  --    remains, or reopen the ones this batch now allows. Only rows cancelled as
  --    `batch_invalid` are ever reopened; a schedule/plan cancellation stays.
  if public.medicine_suppresses_doses(p_medication_id) then
    update public.dose_events
       set cancelled_at = now(), cancel_reason = 'batch_invalid'
     where medication_id = p_medication_id
       and taken_at is null
       and missed_at is null
       and cancelled_at is null
       and scheduled_at > now();
  else
    update public.dose_events
       set cancelled_at = null, cancel_reason = null
     where medication_id = p_medication_id
       and cancelled_at is not null
       and cancel_reason = 'batch_invalid'
       and taken_at is null
       and missed_at is null
       and scheduled_at > now();
  end if;

  -- 1. Cancel future occurrences that the current plan no longer produces.
  update public.dose_events d
     set cancelled_at = now(),
         cancel_reason = case
           when not s.is_active
             or not exists (
               select 1 from public.medications m
               where m.id = p_medication_id and m.is_active
             )
             then 'plan_deactivated'
           else 'schedule_changed'
         end
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

  -- 2. Refresh the plan fields on the future occurrences that survive.
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

  -- 3. Regenerate, but only for an active plan that is not suppressed.
  if exists (select 1 from public.medications where id = p_medication_id and is_active)
     and not public.medicine_suppresses_doses(p_medication_id) then
    v_created := public.generate_dose_events_for(v_elder, current_date, current_date + 3);
  end if;

  return v_created;
end;
$$;

comment on function public.reconcile_dose_events_for_medication(uuid) is
  'Closes Sprint 3''s hand-off and Sprint 5''s suppression: a plan, schedule or batch change affects future occurrences only. Internal; called from the reconcile triggers.';

create or replace function public.reconcile_batch_dose_events()
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

create trigger medicine_batches_reconcile_dose_events
  after insert or update on public.medicine_batches
  for each row execute function public.reconcile_batch_dose_events();

-- ---------------------------------------------------------------------------
-- B. The stock ledger and manual adjustments
-- ---------------------------------------------------------------------------

alter table public.inventory_transactions
  drop constraint inventory_transactions_reason_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_reason_check
  check (reason in ('dose_confirmed', 'manual_adjustment'));

-- The owner-approved reason code for a manual adjustment, queryable in the
-- ledger; null for an automatic dose decrement.
alter table public.inventory_transactions
  add column adjustment_reason text;

alter table public.inventory_transactions
  add constraint inventory_transactions_adjustment_reason_check
  check (
    adjustment_reason is null
    or adjustment_reason in ('restock', 'correction', 'damage', 'waste', 'count_adjustment')
  );

alter table public.inventory_transactions
  add constraint inventory_transactions_adjustment_reason_required
  check (reason <> 'manual_adjustment' or adjustment_reason is not null);

comment on column public.inventory_transactions.adjustment_reason is
  'Machine-readable reason for a manual_adjustment row (restock/correction/damage/waste/count_adjustment). Null for dose_confirmed.';

-- The caregiver's only stock write. Appends one signed ledger row and one audit
-- row; rejects rather than clamping. A rejected call writes nothing.
create or replace function public.adjust_stock(
  p_batch_id uuid,
  p_delta numeric,
  p_reason text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.medicine_batches;
  v_med public.medications;
  v_elder uuid;
  v_reason text;
  v_note text;
  v_new numeric(10, 3);
  v_id uuid;
begin
  if p_batch_id is null then
    raise exception 'a batch is required' using errcode = 'check_violation';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'a non-zero adjustment is required' using errcode = 'check_violation';
  end if;

  select * into v_batch from public.medicine_batches where id = p_batch_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_med from public.medications where id = v_batch.medication_id;
  select public.medication_elder_id(v_batch.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  if not v_batch.is_active then
    raise exception 'only an active batch can be adjusted' using errcode = 'check_violation';
  end if;
  if v_med.is_active is not true then
    raise exception 'activate the medicine before adjusting its stock'
      using errcode = 'check_violation';
  end if;
  if v_batch.expiry_date < current_date then
    raise exception 'an expired batch cannot be adjusted' using errcode = 'check_violation';
  end if;

  v_reason := nullif(lower(btrim(p_reason)), '');
  if v_reason is null
     or v_reason not in ('restock', 'correction', 'damage', 'waste', 'count_adjustment') then
    raise exception 'a valid adjustment reason is required' using errcode = 'check_violation';
  end if;

  v_note := nullif(btrim(p_note), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'the adjustment note is too long' using errcode = 'check_violation';
  end if;

  v_new := v_batch.quantity + p_delta;
  if v_new < 0 then
    raise exception 'an adjustment cannot drive the quantity below zero'
      using errcode = 'check_violation';
  end if;

  update public.medicine_batches set quantity = v_new where id = p_batch_id;

  insert into public.inventory_transactions (
    batch_id, delta, reason, adjustment_reason, actor_id, note
  ) values (
    p_batch_id, p_delta, 'manual_adjustment', v_reason, auth.uid(), v_note
  )
  returning id into v_id;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, 'inventory.adjusted', 'medicine_batches', p_batch_id,
    jsonb_build_object('quantity', v_batch.quantity, 'unit', v_batch.unit),
    jsonb_build_object(
      'quantity', v_new,
      'unit', v_batch.unit,
      'delta', p_delta,
      'reason', v_reason,
      'note', v_note
    )
  );

  return v_id;
end;
$$;

comment on function public.adjust_stock(uuid, numeric, text, text) is
  'Manager-only manual stock correction. Rejects a below-zero result; appends one inventory_transactions row and one audit_events row.';

-- ---------------------------------------------------------------------------
-- C. Per-transition alerts
-- ---------------------------------------------------------------------------

alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check
  check (
    event_type in (
      'dose_confirmed', 'dose_missed',
      'stock_low', 'stock_out', 'stock_expiring', 'medicine_needs_review'
    )
  );

-- A stable per-event dedup value. For a dose event this is the dose id (the old
-- lifetime key); for a stock alert it carries the per-medicine transition
-- sequence, so low -> normal -> low alerts twice.
alter table public.notifications
  add column dedup_key text;

update public.notifications
   set dedup_key = coalesce(target_id::text, id::text)
 where dedup_key is null;

alter table public.notifications
  alter column dedup_key set not null;

drop index public.notifications_event_key;

create unique index notifications_event_key
  on public.notifications (recipient_id, event_type, dedup_key);

-- Replaced because its `on conflict` must target the new unique index.
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
  insert into public.notifications (
    recipient_id, elder_id, event_type, target_table, target_id, dedup_key
  )
  select cl.member_id, p_elder_id, p_event_type, 'dose_events', p_target_id,
         p_target_id::text
  from public.care_links cl
  where cl.elder_id = p_elder_id
    and cl.member_role = 'caregiver'
    and cl.access_level = 'manage'
    and cl.status = 'active'
  on conflict (recipient_id, event_type, dedup_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One row per medicine and alert kind, holding the last emitted state and a
-- transition counter. Server-only; no client policy and no client grant.
create table public.medicine_alert_state (
  medication_id uuid not null references public.medications (id) on delete restrict,
  alert_kind text not null check (alert_kind in ('stock_level', 'expiry', 'suppression')),
  last_key text,
  transition_seq integer not null default 0 check (transition_seq >= 0),
  updated_at timestamptz not null default now(),
  primary key (medication_id, alert_kind)
);

comment on table public.medicine_alert_state is
  'Per-medicine alert cursor: the last emitted state key and a transition counter, so a recurring state alerts again but a repeated sweep does not. Internal.';

alter table public.medicine_alert_state enable row level security;

-- The daily sweep. Server-only. Emits at most one notification per active
-- caregiver manager per state transition.
create or replace function public.check_inventory_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_med record;
  v_batch public.medicine_batches;
  v_days integer;
  v_stock_key text;
  v_expiry_key text;
  v_suppression_key text;
  v_kinds text[] := array['stock_level', 'expiry', 'suppression'];
  v_keys text[];
  v_kind text;
  v_key text;
  v_state public.medicine_alert_state;
  v_seq integer;
  v_event text;
  v_recipient uuid;
  v_count integer := 0;
  i integer;
begin
  for v_med in
    select m.id, m.elder_id
    from public.medications m
    where m.is_active
  loop
    select * into v_batch
    from public.medicine_batches b
    where b.medication_id = v_med.id and b.is_active
    limit 1;

    -- No active batch: nothing to alert on. (Suppression is handled below.)
    if v_batch.id is null then
      v_stock_key := 'normal';
      v_expiry_key := 'none';
    else
      if v_batch.quantity <= 0 then
        v_stock_key := 'out';
      elsif v_batch.low_stock_threshold is not null
            and v_batch.quantity <= v_batch.low_stock_threshold then
        v_stock_key := 'low';
      else
        v_stock_key := 'normal';
      end if;

      v_days := v_batch.expiry_date - current_date;
      v_expiry_key := case
        when v_days < 0 then 'expired'
        when v_days <= 1 then 'd1'
        when v_days <= 7 then 'd7'
        when v_days <= 14 then 'd14'
        when v_days <= 30 then 'd30'
        else 'none'
      end;
    end if;

    v_suppression_key := case
      when public.medicine_suppresses_doses(v_med.id) then 'needs_review'
      else 'ok'
    end;

    v_keys := array[v_stock_key, v_expiry_key, v_suppression_key];

    for i in 1 .. array_length(v_kinds, 1) loop
      v_kind := v_kinds[i];
      v_key := v_keys[i];

      insert into public.medicine_alert_state (
        medication_id, alert_kind, last_key, transition_seq
      ) values (
        v_med.id, v_kind, null, 0
      )
      on conflict (medication_id, alert_kind) do nothing;

      select * into v_state
      from public.medicine_alert_state
      where medication_id = v_med.id and alert_kind = v_kind
      for update;

      if v_state.last_key is distinct from v_key then
        v_seq := v_state.transition_seq + 1;

        update public.medicine_alert_state
           set last_key = v_key, transition_seq = v_seq, updated_at = now()
         where medication_id = v_med.id and alert_kind = v_kind;

        v_event := case v_kind
          when 'stock_level' then
            case v_key when 'low' then 'stock_low' when 'out' then 'stock_out' else null end
          when 'expiry' then
            case when v_key in ('d30', 'd14', 'd7', 'd1') then 'stock_expiring' else null end
          when 'suppression' then
            case when v_key = 'needs_review' then 'medicine_needs_review' else null end
          else null
        end;

        if v_event is not null then
          for v_recipient in
            select cl.member_id
            from public.care_links cl
            where cl.elder_id = v_med.elder_id
              and cl.member_role = 'caregiver'
              and cl.access_level = 'manage'
              and cl.status = 'active'
          loop
            insert into public.notifications (
              recipient_id, elder_id, event_type, target_table, target_id, dedup_key
            ) values (
              v_recipient, v_med.elder_id, v_event, 'medications', v_med.id,
              v_med.id::text || ':' || v_kind || ':' || v_seq
            )
            on conflict (recipient_id, event_type, dedup_key) do nothing;

            v_count := v_count + 1;
          end loop;
        end if;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

comment on function public.check_inventory_alerts() is
  'One alert per active caregiver manager per medicine state transition. Idempotent for a repeated run in the same state. Server-only, scheduled by pg_cron.';

-- Schedule the daily sweep. Guarded so an unavailable scheduler degrades to a
-- documented limitation rather than a failed migration.
do $$
begin
  perform cron.unschedule('check_inventory_alerts');
exception
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'check_inventory_alerts',
    '0 7 * * *',
    'select public.check_inventory_alerts();'
  );
exception
  when others then
    raise notice 'pg_cron unavailable; check_inventory_alerts was not scheduled: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

-- Append-only ledger stays read-only to the circle; the sweep cursor is invisible
-- to every client role.
revoke all on public.medicine_alert_state from public, anon, authenticated;
revoke insert, update, delete on public.inventory_transactions, public.notifications
  from authenticated;
grant select on public.inventory_transactions, public.notifications to authenticated;

revoke execute on function
  public.cancel_future_dose_events(uuid, smallint[], time, text),
  public.medicine_has_any_batch(uuid),
  public.medicine_has_valid_active_batch(uuid),
  public.medicine_suppresses_doses(uuid),
  public.generate_dose_events_for(uuid, date, date),
  public.reconcile_dose_events_for_medication(uuid),
  public.reconcile_batch_dose_events(),
  public.adjust_stock(uuid, numeric, text, text),
  public.check_inventory_alerts(),
  public.notify_dose_event(text, uuid, uuid)
  from public, anon, authenticated;

-- The one new client API.
grant execute on function
  public.adjust_stock(uuid, numeric, text, text)
  to authenticated;

-- The batch trigger needs EXECUTE under the DML role, like the Sprint 4
-- reconcile triggers; a `trigger`-returning function is not directly callable.
grant execute on function
  public.reconcile_batch_dose_events()
  to authenticated;
