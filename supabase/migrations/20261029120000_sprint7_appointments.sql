-- Sprint 7: appointments (Flow F).
--
-- docs/specs/sprint-7.md as schema. Two appointment types with their conditional
-- fields, a guarded lifecycle (upcoming -> completed | cancelled, with `overdue`
-- derived on read), one in-app reminder per appointment at a fixed lead time, and
-- an audit row for every state change. `appointments` has no write policy and no
-- client write grant: the four RPCs are the only write path, and they all follow
-- resolve -> derive elder from the row -> is_manager_of -> validate -> row lock ->
-- re-read -> mutate + exactly one audit row. A rejected or true no-op call writes
-- no audit row.
--
-- Nothing is hard-deleted. All foreign keys are on delete restrict.

-- ---------------------------------------------------------------------------
-- A. Table
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.profiles (id) on delete restrict,
  appointment_type text not null check (appointment_type in ('visit', 'in_home')),
  state text not null default 'upcoming' check (state in ('upcoming', 'completed', 'cancelled')),
  title text not null check (length(btrim(title)) between 1 and 120),
  start_at timestamptz not null,
  timezone text not null check (length(btrim(timezone)) between 1 and 64),
  provider text check (provider is null or length(btrim(provider)) between 1 and 120),
  facility text check (facility is null or length(btrim(facility)) between 1 and 160),
  location text check (location is null or length(btrim(location)) between 1 and 200),
  address text check (address is null or length(btrim(address)) between 1 and 300),
  contact_phone text check (contact_phone is null or length(btrim(contact_phone)) between 1 and 40),
  notes text check (notes is null or length(btrim(notes)) between 1 and 1000),
  reminder_lead_minutes integer
    check (reminder_lead_minutes is null or reminder_lead_minutes in (60, 180, 1440, 2880)),
  notify_elder boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  completion_note text check (completion_note is null or length(btrim(completion_note)) between 1 and 500),
  cancel_note text check (cancel_note is null or length(btrim(cancel_note)) between 1 and 500),

  -- `overdue` is derived on read, never stored, so a contradictory timestamp set
  -- is impossible.
  constraint appointments_state_consistent check (
    (state = 'upcoming' and completed_at is null and cancelled_at is null)
    or (state = 'completed' and completed_at is not null and cancelled_at is null)
    or (state = 'cancelled' and completed_at is null and cancelled_at is not null)
  ),
  constraint appointments_completion_note_state check (
    completion_note is null or state = 'completed'
  ),
  constraint appointments_cancel_note_state check (
    cancel_note is null or state = 'cancelled'
  ),
  -- Conditional fields (product-flow section 8). Whitespace-only is not a value.
  constraint appointments_visit_fields check (
    appointment_type <> 'visit'
    or (length(btrim(coalesce(facility, ''))) > 0 and length(btrim(coalesce(location, ''))) > 0)
  ),
  constraint appointments_in_home_fields check (
    appointment_type <> 'in_home'
    or (
      length(btrim(coalesce(address, ''))) > 0
      and length(btrim(coalesce(provider, ''))) > 0
      and length(btrim(coalesce(contact_phone, ''))) > 0
    )
  )
);

comment on table public.appointments is
  'One appointment per row: visit or in-home, with a guarded lifecycle. overdue is derived on read; no client write policy — the RPCs are the only write path.';

create index appointments_by_elder on public.appointments (elder_id, start_at desc);
-- The reminder sweep narrows to upcoming rows that have a reminder set.
create index appointments_reminder_sweep on public.appointments (state, start_at)
  where state = 'upcoming' and reminder_lead_minutes is not null;

create trigger appointments_touch_updated_at
  before update on public.appointments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- B. Policy and grants: select-only, default deny.
-- ---------------------------------------------------------------------------

alter table public.appointments enable row level security;

create policy appointments_select on public.appointments
  for select to authenticated
  using (public.is_elder_self(elder_id) or public.is_active_member_of(elder_id));

revoke all on public.appointments from public, anon;
revoke insert, update, delete on public.appointments from authenticated;
grant select on public.appointments to authenticated;

-- ---------------------------------------------------------------------------
-- C. Audit snapshot and field validation
-- ---------------------------------------------------------------------------

create or replace function public.appointment_audit_summary(p_row public.appointments)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'appointment_type', p_row.appointment_type,
    'state', p_row.state,
    'title', p_row.title,
    'start_at', p_row.start_at,
    'timezone', p_row.timezone,
    'provider', p_row.provider,
    'facility', p_row.facility,
    'location', p_row.location,
    'address', p_row.address,
    'contact_phone', p_row.contact_phone,
    'notes', p_row.notes,
    'reminder_lead_minutes', p_row.reminder_lead_minutes,
    'notify_elder', p_row.notify_elder,
    'completed_at', p_row.completed_at,
    'cancelled_at', p_row.cancelled_at,
    'completion_note', p_row.completion_note,
    'cancel_note', p_row.cancel_note
  );
$$;

-- Shared by create and update: trims nothing itself, but rejects an unknown type,
-- a blank/over-long field, a bad lead time, an invalid timezone, and a missing
-- conditional field for the chosen type. Returns the trimmed timezone.
create or replace function public.assert_appointment_fields(
  p_appointment_type text,
  p_title text,
  p_start_date date,
  p_start_time time,
  p_timezone text,
  p_provider text,
  p_facility text,
  p_location text,
  p_address text,
  p_contact_phone text,
  p_notes text,
  p_reminder_lead_minutes integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
begin
  if p_appointment_type is null or p_appointment_type not in ('visit', 'in_home') then
    raise exception 'an appointment type must be visit or in_home'
      using errcode = 'check_violation';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'an appointment title is required' using errcode = 'check_violation';
  end if;
  if length(btrim(p_title)) > 120 then
    raise exception 'the appointment title is too long (120 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_start_date is null then
    raise exception 'an appointment date is required' using errcode = 'check_violation';
  end if;
  if p_start_time is null then
    raise exception 'an appointment time is required' using errcode = 'check_violation';
  end if;

  perform public.assert_valid_timezone(p_timezone);
  v_tz := btrim(p_timezone);

  if p_appointment_type = 'visit' then
    if p_facility is null or length(btrim(p_facility)) = 0 then
      raise exception 'a clinic or facility is required for a clinic visit'
        using errcode = 'check_violation';
    end if;
    if p_location is null or length(btrim(p_location)) = 0 then
      raise exception 'a location is required for a clinic visit'
        using errcode = 'check_violation';
    end if;
  else
    if p_address is null or length(btrim(p_address)) = 0 then
      raise exception 'an address is required for an in-home visit'
        using errcode = 'check_violation';
    end if;
    if p_provider is null or length(btrim(p_provider)) = 0 then
      raise exception 'a visitor or provider is required for an in-home visit'
        using errcode = 'check_violation';
    end if;
    if p_contact_phone is null or length(btrim(p_contact_phone)) = 0 then
      raise exception 'a contact number is required for an in-home visit'
        using errcode = 'check_violation';
    end if;
  end if;

  if p_provider is not null and length(btrim(p_provider)) > 120 then
    raise exception 'the provider or visitor is too long (120 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_facility is not null and length(btrim(p_facility)) > 160 then
    raise exception 'the facility is too long (160 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_location is not null and length(btrim(p_location)) > 200 then
    raise exception 'the location is too long (200 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_address is not null and length(btrim(p_address)) > 300 then
    raise exception 'the address is too long (300 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_contact_phone is not null and length(btrim(p_contact_phone)) > 40 then
    raise exception 'the contact number is too long (40 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_notes is not null and length(btrim(p_notes)) > 1000 then
    raise exception 'the notes are too long (1000 characters maximum)'
      using errcode = 'check_violation';
  end if;
  if p_reminder_lead_minutes is not null
     and p_reminder_lead_minutes not in (60, 180, 1440, 2880) then
    raise exception 'the reminder lead time is not one of the allowed values'
      using errcode = 'check_violation';
  end if;

  return v_tz;
end;
$$;

-- Insert/update the editable columns from normalized arguments. Kept in one place
-- so create and update cannot drift.
create or replace function public.appointment_apply_fields(
  p_id uuid,
  p_appointment_type text,
  p_title text,
  p_start_at timestamptz,
  p_timezone text,
  p_provider text,
  p_facility text,
  p_location text,
  p_address text,
  p_contact_phone text,
  p_notes text,
  p_reminder_lead_minutes integer,
  p_notify_elder boolean
)
returns public.appointments
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.appointments set
    appointment_type = p_appointment_type,
    title = btrim(p_title),
    start_at = p_start_at,
    timezone = p_timezone,
    provider = nullif(btrim(p_provider), ''),
    facility = nullif(btrim(p_facility), ''),
    location = nullif(btrim(p_location), ''),
    address = nullif(btrim(p_address), ''),
    contact_phone = nullif(btrim(p_contact_phone), ''),
    notes = nullif(btrim(p_notes), ''),
    reminder_lead_minutes = p_reminder_lead_minutes,
    notify_elder = coalesce(p_notify_elder, true)
  where id = p_id
  returning *;
$$;

-- ---------------------------------------------------------------------------
-- D. RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_appointment(
  p_elder_id uuid,
  p_appointment_type text,
  p_title text,
  p_start_date date,
  p_start_time time,
  p_timezone text,
  p_provider text,
  p_facility text,
  p_location text,
  p_address text,
  p_contact_phone text,
  p_notes text,
  p_reminder_lead_minutes integer,
  p_notify_elder boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_start_at timestamptz;
  v_row public.appointments;
begin
  if p_elder_id is null then
    raise exception 'an elder id is required' using errcode = 'check_violation';
  end if;
  if not public.is_manager_of(p_elder_id) then
    raise exception 'only the linked manager can change this elder''s appointments'
      using errcode = 'insufficient_privilege';
  end if;

  v_tz := public.assert_appointment_fields(
    p_appointment_type, p_title, p_start_date, p_start_time, p_timezone, p_provider,
    p_facility, p_location, p_address, p_contact_phone, p_notes, p_reminder_lead_minutes
  );

  v_start_at := public.local_dose_timestamp(p_start_date, p_start_time, v_tz);
  if v_start_at is null then
    raise exception 'that local time does not exist in this timezone (daylight-saving gap)'
      using errcode = 'check_violation';
  end if;

  insert into public.appointments (
    elder_id, appointment_type, title, start_at, timezone,
    provider, facility, location, address, contact_phone, notes,
    reminder_lead_minutes, notify_elder, created_by
  ) values (
    p_elder_id, p_appointment_type, btrim(p_title), v_start_at, v_tz,
    nullif(btrim(p_provider), ''), nullif(btrim(p_facility), ''),
    nullif(btrim(p_location), ''), nullif(btrim(p_address), ''),
    nullif(btrim(p_contact_phone), ''), nullif(btrim(p_notes), ''),
    p_reminder_lead_minutes, coalesce(p_notify_elder, true), auth.uid()
  )
  returning * into v_row;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), p_elder_id, 'appointment.created', 'appointments', v_row.id,
    public.appointment_audit_summary(v_row)
  );

  return v_row.id;
end;
$$;

create or replace function public.update_appointment(
  p_id uuid,
  p_appointment_type text,
  p_title text,
  p_start_date date,
  p_start_time time,
  p_timezone text,
  p_provider text,
  p_facility text,
  p_location text,
  p_address text,
  p_contact_phone text,
  p_notes text,
  p_reminder_lead_minutes integer,
  p_notify_elder boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.appointments;
  v_after public.appointments;
  v_tz text;
  v_start_at timestamptz;
begin
  select * into v_before from public.appointments where id = p_id for update;
  if not found or not public.is_manager_of(v_before.elder_id) then
    raise exception 'only the linked manager can change this elder''s appointments'
      using errcode = 'insufficient_privilege';
  end if;
  if v_before.state <> 'upcoming' then
    raise exception 'a past appointment cannot be edited'
      using errcode = 'check_violation';
  end if;

  v_tz := public.assert_appointment_fields(
    p_appointment_type, p_title, p_start_date, p_start_time, p_timezone, p_provider,
    p_facility, p_location, p_address, p_contact_phone, p_notes, p_reminder_lead_minutes
  );

  v_start_at := public.local_dose_timestamp(p_start_date, p_start_time, v_tz);
  if v_start_at is null then
    raise exception 'that local time does not exist in this timezone (daylight-saving gap)'
      using errcode = 'check_violation';
  end if;

  v_after := public.appointment_apply_fields(
    p_id, p_appointment_type, p_title, v_start_at, v_tz, p_provider, p_facility,
    p_location, p_address, p_contact_phone, p_notes, p_reminder_lead_minutes,
    p_notify_elder
  );

  if to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at' then
    return;
  end if;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_after.elder_id, 'appointment.updated', 'appointments', p_id,
    public.appointment_audit_summary(v_before), public.appointment_audit_summary(v_after)
  );
end;
$$;

create or replace function public.complete_appointment(p_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.appointments;
  v_after public.appointments;
  v_note text;
begin
  select * into v_before from public.appointments where id = p_id for update;
  if not found or not public.is_manager_of(v_before.elder_id) then
    raise exception 'only the linked manager can change this elder''s appointments'
      using errcode = 'insufficient_privilege';
  end if;

  -- Repeating the same terminal operation is a no-op; the opposite one is refused.
  if v_before.state = 'completed' then
    return v_before.id;
  end if;
  if v_before.state <> 'upcoming' then
    raise exception 'a cancelled appointment cannot be completed'
      using errcode = 'check_violation';
  end if;

  v_note := nullif(btrim(p_note), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'the completion note is too long (500 characters maximum)'
      using errcode = 'check_violation';
  end if;

  update public.appointments
    set state = 'completed', completed_at = now(), completion_note = v_note
    where id = p_id
    returning * into v_after;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_after.elder_id, 'appointment.completed', 'appointments', p_id,
    public.appointment_audit_summary(v_before), public.appointment_audit_summary(v_after)
  );

  return v_after.id;
end;
$$;

create or replace function public.cancel_appointment(p_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.appointments;
  v_after public.appointments;
  v_note text;
begin
  select * into v_before from public.appointments where id = p_id for update;
  if not found or not public.is_manager_of(v_before.elder_id) then
    raise exception 'only the linked manager can change this elder''s appointments'
      using errcode = 'insufficient_privilege';
  end if;

  if v_before.state = 'cancelled' then
    return v_before.id;
  end if;
  if v_before.state <> 'upcoming' then
    raise exception 'a completed appointment cannot be cancelled'
      using errcode = 'check_violation';
  end if;

  v_note := nullif(btrim(p_note), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'the cancellation note is too long (500 characters maximum)'
      using errcode = 'check_violation';
  end if;

  update public.appointments
    set state = 'cancelled', cancelled_at = now(), cancel_note = v_note
    where id = p_id
    returning * into v_after;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_after.elder_id, 'appointment.cancelled', 'appointments', p_id,
    public.appointment_audit_summary(v_before), public.appointment_audit_summary(v_after)
  );

  return v_after.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- E. Reminder sweep
-- ---------------------------------------------------------------------------

-- Widen the notification vocabulary forward; the Sprint 5 values stay.
alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check
  check (
    event_type in (
      'dose_confirmed', 'dose_missed',
      'stock_low', 'stock_out', 'stock_expiring', 'medicine_needs_review',
      'appointment_upcoming'
    )
  );

-- One reminder per appointment per recipient. The dedup key is the appointment id
-- alone, so editing the lead time or start time after emission cannot fire again;
-- turning the reminder Off or moving to a terminal state simply stops future runs.
-- The reference clock is a parameter so the pgTAP suite is deterministic; the
-- no-argument wrapper is what pg_cron calls. Server-only.
create or replace function public.check_appointment_reminders_at(p_reference timestamptz)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.appointments;
  v_inserted integer;
  v_total integer := 0;
begin
  for v_row in
    select *
    from public.appointments
    where state = 'upcoming'
      and reminder_lead_minutes is not null
      and p_reference >= start_at - make_interval(mins => reminder_lead_minutes)
      and p_reference < start_at
    for update
  loop
    insert into public.notifications (
      recipient_id, elder_id, event_type, target_table, target_id, dedup_key
    )
    select r.recipient_id, v_row.elder_id, 'appointment_upcoming', 'appointments',
           v_row.id, 'appointment:' || v_row.id::text
    from (
      select v_row.elder_id as recipient_id
      where v_row.notify_elder
        and exists (
          select 1 from public.profiles p
          where p.id = v_row.elder_id and p.deactivated_at is null
        )
      union
      select cl.member_id
      from public.care_links cl
      join public.profiles p on p.id = cl.member_id and p.deactivated_at is null
      where cl.elder_id = v_row.elder_id
        and cl.member_role = 'caregiver'
        and cl.access_level = 'manage'
        and cl.status = 'active'
    ) r
    on conflict (recipient_id, event_type, dedup_key) do nothing;

    get diagnostics v_inserted = row_count;
    v_total := v_total + v_inserted;
  end loop;

  return v_total;
end;
$$;

comment on function public.check_appointment_reminders_at(timestamptz) is
  'Emits one in-app reminder per recipient for each upcoming appointment inside its lead-time window. Idempotent per appointment; server-only; the reference clock is a parameter so tests are deterministic.';

create or replace function public.check_appointment_reminders()
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select public.check_appointment_reminders_at(now());
$$;

comment on function public.check_appointment_reminders() is
  'pg_cron entry point: check_appointment_reminders_at(now()).';

-- Every 15 minutes, guarded so an unavailable scheduler degrades to a documented
-- limitation rather than a failed migration.
do $$
begin
  perform cron.unschedule('check_appointment_reminders');
exception
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'check_appointment_reminders',
    '*/15 * * * *',
    'select public.check_appointment_reminders();'
  );
exception
  when others then
    raise notice 'pg_cron unavailable; check_appointment_reminders was not scheduled: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- F. Execute grants: the four RPCs are the only client API.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.appointment_audit_summary(public.appointments),
  public.assert_appointment_fields(text, text, date, time, text, text, text, text, text, text, text, integer),
  public.appointment_apply_fields(uuid, text, text, timestamptz, text, text, text, text, text, text, text, integer, boolean),
  public.create_appointment(uuid, text, text, date, time, text, text, text, text, text, text, text, integer, boolean),
  public.update_appointment(uuid, text, text, date, time, text, text, text, text, text, text, text, integer, boolean),
  public.complete_appointment(uuid, text),
  public.cancel_appointment(uuid, text),
  public.check_appointment_reminders_at(timestamptz),
  public.check_appointment_reminders()
  from public, anon, authenticated;

grant execute on function
  public.create_appointment(uuid, text, text, date, time, text, text, text, text, text, text, text, integer, boolean),
  public.update_appointment(uuid, text, text, date, time, text, text, text, text, text, text, text, integer, boolean),
  public.complete_appointment(uuid, text),
  public.cancel_appointment(uuid, text)
  to authenticated;
