-- Sprint 3: medication, schedule and stock-batch setup (Flow B).
--
-- Schema, RLS and the guarded RPCs behind `C-02`/`C-03`/`C-04`. Nothing here
-- generates reminders or confirmations; this sprint produces the data and the
-- binding contracts Sprint 4's dose generation reads (docs/specs/sprint-3.md).
--
-- Read these decisions before the code:
--
--   * The slot indexes are PARTIAL (`where is_active`). The spec wrote a plain
--     "Unique (medication_id, time_of_day, days_of_week)", but acceptance
--     criterion 8 requires that deactivating a schedule and then creating a new
--     active one for the same slot succeeds. An unconditional index makes that
--     impossible, so the index carries `where is_active`.
--   * `deactivate_batch` is added. The spec's RPC list can activate a batch
--     (`set_active_batch`) but gives no way to deactivate one, while criterion
--     8 requires a batch to be deactivated and kept. It is shaped like
--     `deactivate_emergency_number` in Sprint 2.
--   * The audit vocabulary is symmetric: `<table>.created`, `.updated`,
--     `.deactivated`, `.reactivated`, plus `batch.activated` for the call that
--     moves the single active batch. The spec listed a subset; activating a
--     schedule needs an action string, so `schedule.reactivated` exists rather
--     than overloading `schedule.updated`.
--   * Family members read the base tables. The spec's prose says family reads a
--     narrower view, but `docs/00-product-flow.md` section 2 grants the
--     connected family member "View only" on "medication plan, schedules,
--     stock, expiry", and the spec's own open question 9 recommends exactly
--     that. The product flow wins on product scope (AGENTS.md); the narrower
--     view is Sprint 4's open question 6 and narrows the dose/adherence columns
--     when it lands.
--   * A schedule edit must cancel future not-yet-due generated occurrences.
--     `dose_events` does not exist until Sprint 4, so there is nothing to cancel
--     yet; the obligation is recorded on `update_schedule` and in the spec's
--     "Normative Sprint 4 hand-off" section.
--   * Audit summaries carry the full plan field snapshot, including the
--     free-text `instructions`. Sprint 2 minimised the profile audit because the
--     profile text is not the record; here the medication *is* the medical
--     record the audit has to be able to reconstruct. This widens no access:
--     `audit_events_select` admits only the actor, the elder and the manager,
--     never a family member.
--   * Authorization failures are deliberately indistinguishable from a
--     not-found id (same `insufficient_privilege`), so a cross-elder caller
--     cannot use the error to learn whether another elder's row exists.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  strength text not null check (length(btrim(strength)) > 0),
  form text check (form is null or form in ('tablet', 'capsule', 'liquid', 'other')),
  dose_quantity numeric(10, 3) not null check (dose_quantity > 0),
  dose_unit text not null check (length(btrim(dose_unit)) > 0),
  instructions text not null check (length(btrim(instructions)) > 0),
  start_date date not null,
  end_date date,
  is_active boolean not null default false,
  deactivated_at timestamptz,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medications_end_after_start check (end_date is null or end_date >= start_date)
);

comment on table public.medications is
  'One medicine per row, owned by the linked caregiver manager. Created as a draft (is_active false) until it has an active schedule; deactivated, never deleted.';

create trigger medications_touch_updated_at
  before update on public.medications
  for each row execute function public.touch_updated_at();

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete restrict,
  days_of_week smallint[] not null,
  time_of_day time not null,
  timezone text not null check (length(btrim(timezone)) > 0),
  grace_minutes integer not null default 30 check (grace_minutes between 5 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- `cardinality`, not `array_length`: an empty array makes `array_length` NULL,
  -- and a NULL CHECK expression passes. `cardinality('{}')` is 0 and fails.
  constraint medication_schedules_days_not_empty check (cardinality(days_of_week) >= 1),
  constraint medication_schedules_days_in_range
    check (days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  -- Contains-a-NULL also makes `<@` NULL, so screen the elements explicitly.
  constraint medication_schedules_days_no_nulls
    check (array_position(days_of_week, null) is null)
);

comment on table public.medication_schedules is
  'Repeat slot for one medicine: a canonical, sorted, deduplicated weekday set plus one local time in a stored IANA zone. Sprint 4 generates occurrences from (local_date, time_of_day) at this zone.';

create trigger medication_schedules_touch_updated_at
  before update on public.medication_schedules
  for each row execute function public.touch_updated_at();

-- One active schedule per (medicine, time, weekday set). Partial on purpose:
-- a deactivated slot must not block a replacement (acceptance criterion 8).
create unique index medication_schedules_active_slot_key
  on public.medication_schedules (medication_id, time_of_day, days_of_week)
  where is_active;

create table public.medicine_batches (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity >= 0),
  unit text not null check (length(btrim(unit)) > 0),
  lot_number text check (lot_number is null or length(btrim(lot_number)) > 0),
  expiry_date date not null,
  low_stock_threshold numeric(10, 3)
    check (low_stock_threshold is null or low_stock_threshold >= 0),
  refill_contact text check (refill_contact is null or length(btrim(refill_contact)) > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stated by the spec as `expiry_date >= created_at::date`. `created_at` is
  -- stamped by the same insert, so the entry date is `now()::date`; the cast is
  -- evaluated per row and both halves are column values.
  constraint medicine_batches_expiry_not_past check (expiry_date >= created_at::date)
);

comment on table public.medicine_batches is
  'Stock batch for one medicine. At most one active batch; an expired batch can never become or remain active. Deactivated, never deleted.';

create trigger medicine_batches_touch_updated_at
  before update on public.medicine_batches
  for each row execute function public.touch_updated_at();

create unique index medicine_batches_active_key
  on public.medicine_batches (medication_id)
  where is_active;

-- ---------------------------------------------------------------------------
-- Internal helpers. Called from policies or from security-definer RPCs, so the
-- definer's privileges apply; `medication_elder_id` is the one exception, since
-- a policy expression is evaluated as the querying role (see the grants).
-- ---------------------------------------------------------------------------

create or replace function public.medication_elder_id(p_medication_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select elder_id from public.medications where id = p_medication_id;
$$;

comment on function public.medication_elder_id(uuid) is
  'Owner elder of a medicine, for the schedule/batch RLS policies. Granted to authenticated because policy expressions run as the querying role.';

-- Sorted, deduplicated weekdays. `[2,1,2]` becomes `[1,2]`, so the slot index
-- cannot be dodged by reordering (acceptance criterion 7).
create or replace function public.canonicalize_days_of_week(p_days smallint[])
returns smallint[]
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_day smallint;
  v_out smallint[];
begin
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'a schedule needs at least one weekday' using errcode = 'check_violation';
  end if;

  foreach v_day in array p_days loop
    if v_day is null then
      raise exception 'a weekday value is required' using errcode = 'check_violation';
    end if;
    if v_day < 0 or v_day > 6 then
      raise exception 'weekday % is out of range (0 = Sunday, 6 = Saturday)', v_day
        using errcode = 'check_violation';
    end if;
  end loop;

  select array_agg(distinct d order by d) into v_out from unnest(p_days) as d;
  return v_out;
end;
$$;

create or replace function public.assert_valid_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_timezone is null or length(btrim(p_timezone)) = 0 then
    raise exception 'a schedule timezone is required' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = btrim(p_timezone)
  ) then
    raise exception 'unknown timezone "%"', btrim(p_timezone) using errcode = 'check_violation';
  end if;
end;
$$;

-- The validation shared by `create_medication` and `update_medication`.
create or replace function public.assert_medication_fields(
  p_name text,
  p_strength text,
  p_form text,
  p_dose_quantity numeric,
  p_dose_unit text,
  p_instructions text,
  p_start_date date,
  p_end_date date
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form text;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'a medicine name is required' using errcode = 'check_violation';
  end if;
  if p_strength is null or length(btrim(p_strength)) = 0 then
    raise exception 'a strength or form is required' using errcode = 'check_violation';
  end if;
  if p_dose_quantity is null or p_dose_quantity <= 0 then
    raise exception 'dose quantity must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_dose_unit is null or length(btrim(p_dose_unit)) = 0 then
    raise exception 'a dose unit is required' using errcode = 'check_violation';
  end if;
  if p_instructions is null or length(btrim(p_instructions)) = 0 then
    raise exception 'instructions are required' using errcode = 'check_violation';
  end if;
  if p_start_date is null then
    raise exception 'a start date is required' using errcode = 'check_violation';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'the end date cannot be before the start date' using errcode = 'check_violation';
  end if;

  v_form := nullif(lower(btrim(p_form)), '');
  if v_form is not null and v_form not in ('tablet', 'capsule', 'liquid', 'other') then
    raise exception 'unknown dose form "%"', p_form using errcode = 'check_violation';
  end if;

  return v_form;
end;
$$;

create or replace function public.assert_batch_fields(p_quantity numeric, p_unit text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'batch quantity cannot be negative' using errcode = 'check_violation';
  end if;
  if p_unit is null or length(btrim(p_unit)) = 0 then
    raise exception 'a batch unit is required' using errcode = 'check_violation';
  end if;
end;
$$;

-- The medication snapshot the audit stores. One shape for every medication RPC,
-- so `before` and `after` summaries are always comparable.
create or replace function public.medication_audit_summary(p_row public.medications)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'name', p_row.name,
    'strength', p_row.strength,
    'form', p_row.form,
    'dose_quantity', p_row.dose_quantity,
    'dose_unit', p_row.dose_unit,
    'instructions', p_row.instructions,
    'start_date', p_row.start_date,
    'end_date', p_row.end_date,
    'is_active', p_row.is_active
  );
$$;

create or replace function public.schedule_audit_summary(p_row public.medication_schedules)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'days_of_week', to_jsonb(p_row.days_of_week),
    'time_of_day', p_row.time_of_day,
    'timezone', p_row.timezone,
    'grace_minutes', p_row.grace_minutes,
    'is_active', p_row.is_active
  );
$$;

create or replace function public.batch_audit_summary(p_row public.medicine_batches)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'quantity', p_row.quantity,
    'unit', p_row.unit,
    'lot_number', p_row.lot_number,
    'expiry_date', p_row.expiry_date,
    'low_stock_threshold', p_row.low_stock_threshold,
    'refill_contact', p_row.refill_contact,
    'is_active', p_row.is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: default deny, select-only, scoped to the care circle. No policy allows a
-- direct insert/update/delete, so the RPCs below are the only write path.
-- ---------------------------------------------------------------------------

alter table public.medications enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.medicine_batches enable row level security;

create policy medications_select on public.medications
  for select to authenticated
  using (public.can_view_profile(elder_id));

-- Schedules and batches carry no elder column, so they reach it through their
-- medicine. `medication_elder_id` is security definer, so the RLS policy does
-- not have to re-enter the `medications` policy to read its own parent row.
create policy medication_schedules_select on public.medication_schedules
  for select to authenticated
  using (public.can_view_profile(public.medication_elder_id(medication_id)));

create policy medicine_batches_select on public.medicine_batches
  for select to authenticated
  using (public.can_view_profile(public.medication_elder_id(medication_id)));

-- ---------------------------------------------------------------------------
-- RPCs. All security definer. Order is always: resolve the target row ->
-- derive its elder -> is_manager_of -> validate -> take the scoped lock ->
-- re-read -> mutate + exactly one audit row. A rejected or no-op call writes no
-- audit row.
-- ---------------------------------------------------------------------------

create or replace function public.create_medication(
  p_elder_id uuid,
  p_name text,
  p_strength text,
  p_form text,
  p_dose_quantity numeric,
  p_dose_unit text,
  p_instructions text,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form text;
  v_id uuid;
  v_row public.medications;
begin
  if p_elder_id is null then
    raise exception 'an elder id is required' using errcode = 'check_violation';
  end if;
  if not public.is_manager_of(p_elder_id) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  v_form := public.assert_medication_fields(
    p_name, p_strength, p_form, p_dose_quantity, p_dose_unit, p_instructions,
    p_start_date, p_end_date
  );

  perform pg_advisory_xact_lock(hashtextextended('medications:' || p_elder_id::text, 0));

  insert into public.medications (
    elder_id, name, strength, form, dose_quantity, dose_unit, instructions,
    start_date, end_date, is_active, created_by
  ) values (
    p_elder_id, btrim(p_name), btrim(p_strength), v_form, p_dose_quantity,
    btrim(p_dose_unit), btrim(p_instructions), p_start_date, p_end_date, false, auth.uid()
  )
  returning * into v_row;

  v_id := v_row.id;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), p_elder_id, 'medication.created', 'medications', v_id,
    public.medication_audit_summary(v_row)
  );

  return v_id;
end;
$$;

create or replace function public.update_medication(
  p_id uuid,
  p_name text,
  p_strength text,
  p_form text,
  p_dose_quantity numeric,
  p_dose_unit text,
  p_instructions text,
  p_start_date date,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medications;
  v_after public.medications;
  v_form text;
begin
  select * into v_before from public.medications where id = p_id for update;
  if not found or not public.is_manager_of(v_before.elder_id) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  v_form := public.assert_medication_fields(
    p_name, p_strength, p_form, p_dose_quantity, p_dose_unit, p_instructions,
    p_start_date, p_end_date
  );

  update public.medications set
    name = btrim(p_name),
    strength = btrim(p_strength),
    form = v_form,
    dose_quantity = p_dose_quantity,
    dose_unit = btrim(p_dose_unit),
    instructions = btrim(p_instructions),
    start_date = p_start_date,
    end_date = p_end_date
  where id = p_id
  returning * into v_after;

  if to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at' then
    return;
  end if;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_after.elder_id, 'medication.updated', 'medications', p_id,
    public.medication_audit_summary(v_before), public.medication_audit_summary(v_after)
  );
end;
$$;

create or replace function public.set_medication_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medications;
  v_after public.medications;
  v_action text;
begin
  select * into v_before from public.medications where id = p_id for update;
  if not found or not public.is_manager_of(v_before.elder_id) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(p_active, false) then
    if not exists (
      select 1 from public.medication_schedules
      where medication_id = p_id and is_active
    ) then
      raise exception 'a medicine needs at least one active schedule before it can be active'
        using errcode = 'check_violation';
    end if;
    if v_before.is_active then
      return;
    end if;
    v_action := 'medication.reactivated';
    update public.medications
      set is_active = true, deactivated_at = null
      where id = p_id
      returning * into v_after;
  else
    if not v_before.is_active then
      return;
    end if;
    v_action := 'medication.deactivated';
    update public.medications
      set is_active = false, deactivated_at = now()
      where id = p_id
      returning * into v_after;
  end if;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_after.elder_id, v_action, 'medications', p_id,
    public.medication_audit_summary(v_before), public.medication_audit_summary(v_after)
  );
end;
$$;

create or replace function public.create_schedule(
  p_medication_id uuid,
  p_days_of_week smallint[],
  p_time_of_day time,
  p_timezone text,
  p_grace_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_days smallint[];
  v_time time;
  v_grace integer;
  v_row public.medication_schedules;
begin
  select public.medication_elder_id(p_medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  v_days := public.canonicalize_days_of_week(p_days_of_week);
  perform public.assert_valid_timezone(p_timezone);

  if p_time_of_day is null then
    raise exception 'a dose time is required' using errcode = 'check_violation';
  end if;
  v_time := p_time_of_day;

  v_grace := coalesce(p_grace_minutes, 30);
  if v_grace < 5 or v_grace > 120 then
    raise exception 'the grace period must be between 5 and 120 minutes'
      using errcode = 'check_violation';
  end if;

  -- Serialise every slot decision for this medicine, so the existence check and
  -- the insert cannot interleave.
  perform pg_advisory_xact_lock(
    hashtextextended('medication_schedules:' || p_medication_id::text, 0)
  );

  if exists (
    select 1 from public.medication_schedules
    where medication_id = p_medication_id
      and time_of_day = v_time
      and days_of_week = v_days
      and is_active
  ) then
    raise exception 'this medicine already has a schedule for those days and that time'
      using errcode = 'unique_violation';
  end if;

  insert into public.medication_schedules (
    medication_id, days_of_week, time_of_day, timezone, grace_minutes, is_active
  ) values (
    p_medication_id, v_days, v_time, btrim(p_timezone), v_grace, true
  )
  returning * into v_row;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), v_elder, 'schedule.created', 'medication_schedules', v_row.id,
    public.schedule_audit_summary(v_row)
  );

  return v_row.id;
end;
$$;

create or replace function public.update_schedule(
  p_id uuid,
  p_days_of_week smallint[],
  p_time_of_day time,
  p_timezone text,
  p_grace_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medication_schedules;
  v_after public.medication_schedules;
  v_elder uuid;
  v_days smallint[];
  v_grace integer;
begin
  select * into v_before from public.medication_schedules where id = p_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select public.medication_elder_id(v_before.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  v_days := public.canonicalize_days_of_week(p_days_of_week);
  perform public.assert_valid_timezone(p_timezone);

  if p_time_of_day is null then
    raise exception 'a dose time is required' using errcode = 'check_violation';
  end if;

  if p_grace_minutes is not null and (p_grace_minutes < 5 or p_grace_minutes > 120) then
    raise exception 'the grace period must be between 5 and 120 minutes'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medication_schedules:' || v_before.medication_id::text, 0)
  );
  select * into v_before from public.medication_schedules where id = p_id for update;

  -- Defaulted after the re-read, so a concurrent edit cannot be silently
  -- overwritten by a value read before the lock was taken.
  v_grace := coalesce(p_grace_minutes, v_before.grace_minutes);

  if v_before.is_active and exists (
    select 1 from public.medication_schedules
    where medication_id = v_before.medication_id
      and time_of_day = p_time_of_day
      and days_of_week = v_days
      and is_active
      and id <> p_id
  ) then
    raise exception 'this medicine already has a schedule for those days and that time'
      using errcode = 'unique_violation';
  end if;

  -- Sprint 4 obligation: cancelling future not-yet-due `dose_events` for this
  -- schedule belongs here. The table does not exist yet, so this sprint has no
  -- occurrences to cancel; past occurrences are immutable in either case.
  update public.medication_schedules set
    days_of_week = v_days,
    time_of_day = p_time_of_day,
    timezone = btrim(p_timezone),
    grace_minutes = v_grace
  where id = p_id
  returning * into v_after;

  if to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at' then
    return;
  end if;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, 'schedule.updated', 'medication_schedules', p_id,
    public.schedule_audit_summary(v_before), public.schedule_audit_summary(v_after)
  );
end;
$$;

create or replace function public.set_schedule_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medication_schedules;
  v_after public.medication_schedules;
  v_elder uuid;
  v_action text;
begin
  select * into v_before from public.medication_schedules where id = p_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select public.medication_elder_id(v_before.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(p_active, false) = v_before.is_active then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medication_schedules:' || v_before.medication_id::text, 0)
  );

  if not coalesce(p_active, false) then
    -- Deactivating the last active schedule of an active medicine would leave an
    -- active medication without one, which the hand-off contract forbids.
    if (
      select m.is_active
      from public.medications m
      where m.id = v_before.medication_id
    ) and not exists (
      select 1 from public.medication_schedules
      where medication_id = v_before.medication_id and is_active and id <> p_id
    ) then
      raise exception 'deactivate the medicine before its last active schedule'
        using errcode = 'check_violation';
    end if;
  end if;

  v_action := case when coalesce(p_active, false) then 'schedule.reactivated' else 'schedule.deactivated' end;

  update public.medication_schedules
    set is_active = coalesce(p_active, false)
    where id = p_id
    returning * into v_after;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, v_action, 'medication_schedules', p_id,
    public.schedule_audit_summary(v_before), public.schedule_audit_summary(v_after)
  );
end;
$$;

create or replace function public.create_batch(
  p_medication_id uuid,
  p_quantity numeric,
  p_unit text,
  p_lot_number text,
  p_expiry_date date,
  p_low_stock_threshold numeric,
  p_refill_contact text,
  p_make_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_active boolean := coalesce(p_make_active, false);
  v_row public.medicine_batches;
begin
  select public.medication_elder_id(p_medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.assert_batch_fields(p_quantity, p_unit);

  if p_expiry_date is null then
    raise exception 'an expiry date is required' using errcode = 'check_violation';
  end if;
  if p_expiry_date < current_date then
    raise exception 'a batch cannot be entered with an expiry date in the past'
      using errcode = 'check_violation';
  end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold < 0 then
    raise exception 'the low-stock threshold cannot be negative' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medicine_batches:' || p_medication_id::text, 0)
  );

  -- Creating a batch never steals the active slot; `set_active_batch` moves it.
  if v_active and exists (
    select 1 from public.medicine_batches
    where medication_id = p_medication_id and is_active
  ) then
    raise exception 'this medicine already has an active batch'
      using errcode = 'unique_violation';
  end if;

  insert into public.medicine_batches (
    medication_id, quantity, unit, lot_number, expiry_date, low_stock_threshold,
    refill_contact, is_active
  ) values (
    p_medication_id, p_quantity, btrim(p_unit), nullif(btrim(p_lot_number), ''),
    p_expiry_date, p_low_stock_threshold, nullif(btrim(p_refill_contact), ''), v_active
  )
  returning * into v_row;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), v_elder, 'batch.created', 'medicine_batches', v_row.id,
    public.batch_audit_summary(v_row)
  );

  return v_row.id;
end;
$$;

create or replace function public.update_batch(
  p_id uuid,
  p_quantity numeric,
  p_unit text,
  p_lot_number text,
  p_expiry_date date,
  p_low_stock_threshold numeric,
  p_refill_contact text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medicine_batches;
  v_after public.medicine_batches;
  v_elder uuid;
begin
  select * into v_before from public.medicine_batches where id = p_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select public.medication_elder_id(v_before.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.assert_batch_fields(p_quantity, p_unit);

  if p_expiry_date is null then
    raise exception 'an expiry date is required' using errcode = 'check_violation';
  end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold < 0 then
    raise exception 'the low-stock threshold cannot be negative' using errcode = 'check_violation';
  end if;
  -- An expired batch can never remain active.
  if v_before.is_active and p_expiry_date < current_date then
    raise exception 'the active batch cannot expire; deactivate it first'
      using errcode = 'check_violation';
  end if;

  update public.medicine_batches set
    quantity = p_quantity,
    unit = btrim(p_unit),
    lot_number = nullif(btrim(p_lot_number), ''),
    expiry_date = p_expiry_date,
    low_stock_threshold = p_low_stock_threshold,
    refill_contact = nullif(btrim(p_refill_contact), '')
  where id = p_id
  returning * into v_after;

  if to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at' then
    return;
  end if;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, 'batch.updated', 'medicine_batches', p_id,
    public.batch_audit_summary(v_before), public.batch_audit_summary(v_after)
  );
end;
$$;

create or replace function public.set_active_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.medicine_batches;
  v_elder uuid;
  v_previous uuid;
  v_after public.medicine_batches;
begin
  select * into v_target from public.medicine_batches where id = p_batch_id;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select public.medication_elder_id(v_target.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medicine_batches:' || v_target.medication_id::text, 0)
  );

  -- Re-read under the lock: two concurrent calls must not both move the flag.
  select * into v_target from public.medicine_batches where id = p_batch_id;

  if v_target.expiry_date < current_date then
    raise exception 'an expired batch cannot be made active' using errcode = 'check_violation';
  end if;
  if v_target.is_active then
    return;
  end if;

  update public.medicine_batches
    set is_active = false
    where medication_id = v_target.medication_id and is_active
    returning id into v_previous;

  update public.medicine_batches
    set is_active = true
    where id = p_batch_id
    returning * into v_after;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), v_elder, 'batch.activated', 'medicine_batches', p_batch_id,
    public.batch_audit_summary(v_after) || jsonb_build_object('previous_batch_id', v_previous)
  );
end;
$$;

create or replace function public.deactivate_batch(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medicine_batches;
  v_after public.medicine_batches;
  v_elder uuid;
begin
  select * into v_before from public.medicine_batches where id = p_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select public.medication_elder_id(v_before.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  if not v_before.is_active then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medicine_batches:' || v_before.medication_id::text, 0)
  );

  update public.medicine_batches
    set is_active = false
    where id = p_id
    returning * into v_after;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, 'batch.deactivated', 'medicine_batches', p_id,
    public.batch_audit_summary(v_before),
    public.batch_audit_summary(v_after) || jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: read-only for the client; the RPCs are the only write path.
-- ---------------------------------------------------------------------------

revoke all on public.medications, public.medication_schedules, public.medicine_batches
  from public, anon;
revoke insert, update, delete on public.medications, public.medication_schedules,
  public.medicine_batches from authenticated;
grant select on public.medications, public.medication_schedules, public.medicine_batches
  to authenticated;

-- Supabase's default privileges grant EXECUTE on new functions explicitly to
-- `authenticated`, so every new function is revoked from all three roles and
-- only the public API (plus `medication_elder_id`, which a policy calls) is
-- granted back.
revoke execute on function
  public.medication_elder_id(uuid),
  public.canonicalize_days_of_week(smallint[]),
  public.assert_valid_timezone(text),
  public.assert_medication_fields(text, text, text, numeric, text, text, date, date),
  public.assert_batch_fields(numeric, text),
  public.medication_audit_summary(public.medications),
  public.schedule_audit_summary(public.medication_schedules),
  public.batch_audit_summary(public.medicine_batches),
  public.create_medication(uuid, text, text, text, numeric, text, text, date, date),
  public.update_medication(uuid, text, text, text, numeric, text, text, date, date),
  public.set_medication_active(uuid, boolean),
  public.create_schedule(uuid, smallint[], time, text, integer),
  public.update_schedule(uuid, smallint[], time, text, integer),
  public.set_schedule_active(uuid, boolean),
  public.create_batch(uuid, numeric, text, text, date, numeric, text, boolean),
  public.update_batch(uuid, numeric, text, text, date, numeric, text),
  public.set_active_batch(uuid),
  public.deactivate_batch(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.medication_elder_id(uuid),
  public.create_medication(uuid, text, text, text, numeric, text, text, date, date),
  public.update_medication(uuid, text, text, text, numeric, text, text, date, date),
  public.set_medication_active(uuid, boolean),
  public.create_schedule(uuid, smallint[], time, text, integer),
  public.update_schedule(uuid, smallint[], time, text, integer),
  public.set_schedule_active(uuid, boolean),
  public.create_batch(uuid, numeric, text, text, date, numeric, text, boolean),
  public.update_batch(uuid, numeric, text, text, date, numeric, text),
  public.set_active_batch(uuid),
  public.deactivate_batch(uuid, text)
  to authenticated;
