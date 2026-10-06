-- Sprint 8 (Increment B): help requests and availability (Flow F, frames F-11…F-15).
--
-- The owner's binding decisions (2026-10-06):
--   * A help request is created by the older adult only. Every active care-circle member
--     (the caregiver manager and every active family member) is notified. The first member
--     to accept claims it; the elder or the accepter marks it completed; the elder cancels.
--   * Categories are urgent / practical / companionship; the note is optional.
--   * Availability is a per-member Available / Not available toggle plus an optional short
--     note, one row per (elder, member).
--   * Notifications are in-app (this migration) and mirrored to a device notification by the
--     client when the app receives the row (no remote push service; see the sprint spec).
--
-- Safety: default-deny RLS on both tables, reads scoped to the elder and active members, and
-- every write through a guarded RPC. Nothing is hard-deleted; transitions are state changes
-- with timestamps. Help requests are not medical records, so they do not write audit_events.
-- See docs/specs/sprint-8.md.

-- ---------------------------------------------------------------------------
-- A. Tables
-- ---------------------------------------------------------------------------

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  category text not null check (category in ('urgent', 'practical', 'companionship')),
  note text check (note is null or length(note) <= 500),
  state text not null default 'open' check (state in ('open', 'accepted', 'completed', 'cancelled')),
  accepted_by uuid references public.profiles (id) on delete restrict,
  accepted_at timestamptz,
  closed_by uuid references public.profiles (id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The creator is always the older adult themselves (owner decision 2026-10-06).
  constraint help_requests_creator_is_elder check (created_by = elder_id),
  constraint help_requests_state_consistency check (
    (state = 'open' and accepted_by is null and accepted_at is null and closed_at is null)
    or (state = 'accepted'
        and accepted_by is not null and accepted_at is not null and closed_at is null)
    or (state = 'completed'
        and accepted_by is not null and accepted_at is not null and closed_at is not null)
    or (state = 'cancelled' and closed_at is not null)
  )
);

comment on table public.help_requests is
  'A practical, urgent or companionship request raised by the older adult for their care circle. State changes are timestamped; nothing is hard-deleted.';

create index help_requests_elder_created_idx
  on public.help_requests (elder_id, created_at desc);

create table public.member_availability (
  elder_id uuid not null references public.profiles (id) on delete restrict,
  member_id uuid not null references public.profiles (id) on delete restrict,
  is_available boolean not null default true,
  note text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now(),
  primary key (elder_id, member_id)
);

comment on table public.member_availability is
  'One availability toggle (and optional short note) per member per elder. Read by the circle; written only through set_member_availability.';

-- ---------------------------------------------------------------------------
-- B. RLS: default deny, scoped reads, no direct write grant.
-- ---------------------------------------------------------------------------

alter table public.help_requests enable row level security;
alter table public.member_availability enable row level security;

create policy help_requests_select on public.help_requests
  for select to authenticated
  using (elder_id = auth.uid() or public.is_active_member_of(elder_id));

create policy member_availability_select on public.member_availability
  for select to authenticated
  using (elder_id = auth.uid() or public.is_active_member_of(elder_id));

revoke all on public.help_requests, public.member_availability from public, anon;
revoke insert, update, delete on public.help_requests, public.member_availability
  from authenticated;
grant select on public.help_requests, public.member_availability to authenticated;

-- ---------------------------------------------------------------------------
-- C. The notification vocabulary and helper.
-- ---------------------------------------------------------------------------

alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check
  check (
    event_type in (
      'dose_confirmed', 'dose_missed',
      'stock_low', 'stock_out', 'stock_expiring', 'medicine_needs_review',
      'appointment_upcoming',
      'help_request_created', 'help_request_accepted',
      'help_request_completed', 'help_request_cancelled'
    )
  );

-- Notifies the elder and every active care-circle member except the acting account. The dedup
-- key is the request id plus the event, so a repeat call cannot double-notify. Internal.
create or replace function public.notify_help_request(
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
  select r.recipient_id, p_elder_id, p_event_type, 'help_requests', p_target_id,
         'help:' || p_target_id::text || ':' || p_event_type
  from (
    select p_elder_id as recipient_id
    union
    select cl.member_id
    from public.care_links cl
    where cl.elder_id = p_elder_id
      and cl.status = 'active'
  ) r
  join public.profiles p on p.id = r.recipient_id and p.deactivated_at is null
  where r.recipient_id <> auth.uid()
  on conflict (recipient_id, event_type, dedup_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notify_help_request(text, uuid, uuid) is
  'Emits one in-app notification per active circle member and the elder, excluding the actor, deduplicated by request and event. Internal.';

-- ---------------------------------------------------------------------------
-- D. Guarded RPCs: the only client API.
-- ---------------------------------------------------------------------------

-- The older adult raises a request; every active member is notified.
create or replace function public.create_help_request(
  p_category text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_elder is null
     or not exists (
       select 1 from public.profiles
       where id = v_elder and role = 'elder' and deactivated_at is null
     ) then
    raise exception 'only the older adult can ask for help'
      using errcode = 'insufficient_privilege';
  end if;

  if p_category not in ('urgent', 'practical', 'companionship') then
    raise exception 'unknown help-request category' using errcode = 'check_violation';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'the note is too long' using errcode = 'check_violation';
  end if;

  insert into public.help_requests (elder_id, created_by, category, note)
  values (v_elder, v_elder, p_category, v_note)
  returning id into v_id;

  perform public.notify_help_request('help_request_created', v_elder, v_id);
  return v_id;
end;
$$;

-- The first active member to accept claims the request.
create or replace function public.accept_help_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.help_requests;
  v_member uuid := auth.uid();
begin
  select * into v_row from public.help_requests where id = p_id for update;
  if not found then
    raise exception 'that help request no longer exists' using errcode = 'P0002';
  end if;

  if v_member is null or not public.is_active_member_of(v_row.elder_id) then
    raise exception 'only a linked member can accept this request'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.state <> 'open' then
    raise exception 'this request has already been answered' using errcode = 'check_violation';
  end if;

  update public.help_requests
     set state = 'accepted', accepted_by = v_member, accepted_at = now(), updated_at = now()
   where id = p_id;

  perform public.notify_help_request('help_request_accepted', v_row.elder_id, p_id);
end;
$$;

-- The elder or the accepter marks the claimed request completed.
create or replace function public.complete_help_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.help_requests;
  v_actor uuid := auth.uid();
begin
  select * into v_row from public.help_requests where id = p_id for update;
  if not found then
    raise exception 'that help request no longer exists' using errcode = 'P0002';
  end if;

  if v_actor is null or (v_actor <> v_row.elder_id and v_actor <> v_row.accepted_by) then
    raise exception 'only the older adult or the person who accepted can complete this request'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.state <> 'accepted' then
    raise exception 'only an accepted request can be completed' using errcode = 'check_violation';
  end if;

  update public.help_requests
     set state = 'completed', closed_by = v_actor, closed_at = now(), updated_at = now()
   where id = p_id;

  perform public.notify_help_request('help_request_completed', v_row.elder_id, p_id);
end;
$$;

-- The elder can withdraw a request that is still open or accepted.
create or replace function public.cancel_help_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.help_requests;
  v_actor uuid := auth.uid();
begin
  select * into v_row from public.help_requests where id = p_id for update;
  if not found then
    raise exception 'that help request no longer exists' using errcode = 'P0002';
  end if;

  if v_actor is null or v_actor <> v_row.elder_id then
    raise exception 'only the older adult can cancel this request'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.state not in ('open', 'accepted') then
    raise exception 'this request is already closed' using errcode = 'check_violation';
  end if;

  update public.help_requests
     set state = 'cancelled', closed_by = v_actor, closed_at = now(), updated_at = now()
   where id = p_id;

  perform public.notify_help_request('help_request_cancelled', v_row.elder_id, p_id);
end;
$$;

-- A member sets their own availability for one elder.
create or replace function public.set_member_availability(
  p_elder_id uuid,
  p_is_available boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_member is null or not public.is_active_member_of(p_elder_id) then
    raise exception 'only a linked member can set availability'
      using errcode = 'insufficient_privilege';
  end if;

  if v_note is not null and length(v_note) > 200 then
    raise exception 'the availability note is too long' using errcode = 'check_violation';
  end if;

  insert into public.member_availability (elder_id, member_id, is_available, note, updated_at)
  values (p_elder_id, v_member, coalesce(p_is_available, true), v_note, now())
  on conflict (elder_id, member_id)
  do update set
    is_available = excluded.is_available,
    note = excluded.note,
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- E. Realtime: the circle's screens refresh when a request changes.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'help_requests'
    ) then
      alter publication supabase_realtime add table public.help_requests;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- F. Execute grants: the five RPCs are the only client API.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.notify_help_request(text, uuid, uuid),
  public.create_help_request(text, text),
  public.accept_help_request(uuid),
  public.complete_help_request(uuid),
  public.cancel_help_request(uuid),
  public.set_member_availability(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function
  public.create_help_request(text, text),
  public.accept_help_request(uuid),
  public.complete_help_request(uuid),
  public.cancel_help_request(uuid),
  public.set_member_availability(uuid, boolean, text)
  to authenticated;
