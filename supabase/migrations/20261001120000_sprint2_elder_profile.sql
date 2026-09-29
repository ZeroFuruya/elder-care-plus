-- Sprint 2: elder profile and emergency information (Flow G).
--
-- One `elder_profiles` row per linked elder and an ordered `emergency_numbers`
-- list. The linked caregiver manager owns both; the elder and active family
-- members read them. Writes are RPC-only (RLS default deny), every state change
-- writes one audit row, and nothing is hard-deleted
-- (docs/specs/sprint-2.md, docs/00-product-flow.md Flow G).
--
-- Two rules here need explanation:
--   * `emergency_numbers` has at most one active row per category and per
--     priority, and at most one active primary row. "At least one primary when
--     active rows exist" is provided by `ensure_single_primary`, called at the
--     end of every mutating RPC. All number RPCs take the same elder-scoped
--     advisory lock, so those decisions serialise.
--   * `reorder_emergency_numbers` cannot assign priorities in one pass: the
--     `(elder_id, priority)` unique index would collide mid-swap. It uses a
--     two-phase offset reassignment instead.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.elder_profiles (
  elder_id uuid primary key references public.profiles (id) on delete restrict,
  date_of_birth date,
  blood_type text not null default 'unknown'
    check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')),
  address_line1 text check (address_line1 is null or length(btrim(address_line1)) > 0),
  address_line2 text check (address_line2 is null or length(btrim(address_line2)) > 0),
  city text check (city is null or length(btrim(city)) > 0),
  region text check (region is null or length(btrim(region)) > 0),
  postal_code text check (postal_code is null or length(btrim(postal_code)) > 0),
  country_code text check (country_code is null or length(btrim(country_code)) > 0),
  allergies text check (allergies is null or length(btrim(allergies)) > 0),
  conditions text check (conditions is null or length(btrim(conditions)) > 0),
  care_instructions text check (care_instructions is null or length(btrim(care_instructions)) > 0),
  doctor_name text check (doctor_name is null or length(btrim(doctor_name)) > 0),
  doctor_phone text check (doctor_phone is null or length(btrim(doctor_phone)) > 0),
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.elder_profiles is
  'One profile per linked elder, managed by the caregiver. Optional fields stay NULL when absent; never fabricated.';

create trigger elder_profiles_touch_updated_at
  before update on public.elder_profiles
  for each row execute function public.touch_updated_at();

create table public.emergency_numbers (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.elder_profiles (elder_id) on delete restrict,
  category text not null
    check (category in ('emergency_service', 'primary_caregiver', 'alternate_family', 'doctor', 'pharmacy')),
  label text not null check (length(btrim(label)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  priority integer not null check (priority >= 0),
  is_primary boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_numbers_verified_pair check (
    (verified_at is null) = (verified_by is null)
  )
);

comment on table public.emergency_numbers is
  'Ordered emergency contacts for an elder. Deactivated, never deleted; editing label/phone/category clears verification.';

create trigger emergency_numbers_touch_updated_at
  before update on public.emergency_numbers
  for each row execute function public.touch_updated_at();

-- At most one active row per category, per priority, and one primary.
create unique index emergency_numbers_active_category_key
  on public.emergency_numbers (elder_id, category)
  where is_active;

create unique index emergency_numbers_active_priority_key
  on public.emergency_numbers (elder_id, priority)
  where is_active;

create unique index emergency_numbers_one_primary_key
  on public.emergency_numbers (elder_id)
  where is_active and is_primary;

-- Backs the `can_view_profile` predicate reused by both select policies.
create index care_links_elder_member_status_idx
  on public.care_links (elder_id, member_id, status);

-- ---------------------------------------------------------------------------
-- RLS: default deny, select-only, scoped to the care circle. No policy allows a
-- direct insert/update/delete, so the RPCs below are the only write path.
-- ---------------------------------------------------------------------------

alter table public.elder_profiles enable row level security;
alter table public.emergency_numbers enable row level security;

-- `can_view_profile` admits the elder, the active manager and active family
-- members. It is only ever passed `elder_id` (never `created_by`/`verified_by`).
create policy elder_profiles_select on public.elder_profiles
  for select to authenticated
  using (public.can_view_profile(elder_id));

create policy emergency_numbers_select on public.emergency_numbers
  for select to authenticated
  using (public.can_view_profile(elder_id));

-- ---------------------------------------------------------------------------
-- Internal helper: keep the "at least one primary" half of the invariant.
-- ---------------------------------------------------------------------------

create or replace function public.ensure_single_primary(p_elder_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next uuid;
begin
  if exists (
    select 1 from public.emergency_numbers
    where elder_id = p_elder_id and is_active and is_primary
  ) then
    return;
  end if;

  select id into v_next
  from public.emergency_numbers
  where elder_id = p_elder_id and is_active
  order by priority, created_at
  limit 1;

  if v_next is not null then
    update public.emergency_numbers set is_primary = true where id = v_next;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs. All security definer. Order is always: validate -> resolve the elder ->
-- is_manager_of -> take the elder lock -> re-read the target -> mutate + audit.
-- A rejected call writes no audit row; a no-op call writes no audit row.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_elder_profile(
  p_elder_id uuid,
  p_date_of_birth date,
  p_blood_type text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country_code text,
  p_allergies text,
  p_conditions text,
  p_care_instructions text,
  p_doctor_name text,
  p_doctor_phone text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.elder_profiles;
  v_after public.elder_profiles;
begin
  if p_elder_id is null then
    raise exception 'elder id is required' using errcode = 'check_violation';
  end if;
  if not public.is_manager_of(p_elder_id) then
    raise exception 'only the linked manager can edit this profile'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.elder_profiles where elder_id = p_elder_id;

  insert into public.elder_profiles as ep (
    elder_id, date_of_birth, blood_type, address_line1, address_line2, city, region,
    postal_code, country_code, allergies, conditions, care_instructions,
    doctor_name, doctor_phone, created_by
  ) values (
    p_elder_id,
    p_date_of_birth,
    case
      when p_blood_type is null or length(btrim(p_blood_type)) = 0 then 'unknown'
      when lower(btrim(p_blood_type)) = 'unknown' then 'unknown'
      else upper(btrim(p_blood_type))
    end,
    nullif(btrim(p_address_line1), ''),
    nullif(btrim(p_address_line2), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_region), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_country_code), ''),
    nullif(btrim(p_allergies), ''),
    nullif(btrim(p_conditions), ''),
    nullif(btrim(p_care_instructions), ''),
    nullif(btrim(p_doctor_name), ''),
    nullif(btrim(p_doctor_phone), ''),
    auth.uid()
  )
  on conflict (elder_id) do update set
    date_of_birth = excluded.date_of_birth,
    blood_type = excluded.blood_type,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    allergies = excluded.allergies,
    conditions = excluded.conditions,
    care_instructions = excluded.care_instructions,
    doctor_name = excluded.doctor_name,
    doctor_phone = excluded.doctor_phone
  returning * into v_after;

  -- No-op: the stored state is unchanged, so write no audit row (it never
  -- carries phone/address/allergy/condition text either way).
  if v_before.elder_id is not null
    and to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at'
  then
    return;
  end if;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, before_summary, after_summary)
  values (
    auth.uid(), p_elder_id, 'elder_profile.updated', 'elder_profiles', p_elder_id,
    case when v_before.elder_id is null then null else jsonb_build_object(
      'blood_type', v_before.blood_type,
      'has_allergies', v_before.allergies is not null,
      'has_conditions', v_before.conditions is not null,
      'has_care_instructions', v_before.care_instructions is not null
    ) end,
    jsonb_build_object(
      'blood_type', v_after.blood_type,
      'has_allergies', v_after.allergies is not null,
      'has_conditions', v_after.conditions is not null,
      'has_care_instructions', v_after.care_instructions is not null
    )
  );
end;
$$;

create or replace function public.upsert_emergency_number(
  p_elder_id uuid,
  p_category text,
  p_label text,
  p_phone text,
  p_priority integer,
  p_is_primary boolean default false,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid := p_elder_id;
  v_category text := nullif(btrim(p_category), '');
  v_label text := nullif(btrim(p_label), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_before public.emergency_numbers;
  v_after public.emergency_numbers;
  v_id uuid;
  v_reset boolean := false;
begin
  if v_category is null or v_category not in
    ('emergency_service', 'primary_caregiver', 'alternate_family', 'doctor', 'pharmacy') then
    raise exception 'invalid emergency number category' using errcode = 'check_violation';
  end if;
  if v_label is null then
    raise exception 'a label is required' using errcode = 'check_violation';
  end if;
  if v_phone is null or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 3 then
    raise exception 'a valid phone number is required' using errcode = 'check_violation';
  end if;
  if p_priority is null or p_priority < 0 then
    raise exception 'a non-negative priority is required' using errcode = 'check_violation';
  end if;

  -- With an existing row, the row's elder is authoritative.
  if p_id is not null then
    select elder_id into v_elder from public.emergency_numbers where id = p_id;
    if v_elder is null then
      raise exception 'emergency number not found' using errcode = 'no_data_found';
    end if;
  elsif v_elder is null then
    raise exception 'elder id is required' using errcode = 'check_violation';
  end if;

  if not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can edit emergency numbers'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emergency_numbers:' || v_elder::text, 0));

  if p_id is not null then
    select * into v_before
    from public.emergency_numbers
    where id = p_id
    for update;
    if v_before.id is null then
      raise exception 'emergency number not found' using errcode = 'no_data_found';
    end if;
  end if;

  -- A category holds at most one active number. Never silently replace another.
  if exists (
    select 1 from public.emergency_numbers
    where elder_id = v_elder and is_active and category = v_category
      and (p_id is null or id <> p_id)
  ) then
    raise exception 'an active % number already exists', v_category
      using errcode = 'unique_violation';
  end if;

  -- Priority is unique among active rows; reject rather than collide in the index.
  if exists (
    select 1 from public.emergency_numbers
    where elder_id = v_elder and is_active and priority = p_priority
      and (p_id is null or id <> p_id)
  ) then
    raise exception 'priority % is already used', p_priority using errcode = 'unique_violation';
  end if;

  if p_is_primary then
    update public.emergency_numbers
      set is_primary = false
      where elder_id = v_elder and is_active and is_primary
        and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.emergency_numbers (
      elder_id, category, label, phone, priority, is_primary, created_by
    ) values (
      v_elder, v_category, v_label, v_phone, p_priority, p_is_primary, auth.uid()
    )
    returning * into v_after;
  else
    -- Editing the contact details invalidates the caregiver's verification.
    v_reset := v_before.label is distinct from v_label
      or v_before.phone is distinct from v_phone
      or v_before.category is distinct from v_category;

    update public.emergency_numbers set
      category = v_category,
      label = v_label,
      phone = v_phone,
      priority = p_priority,
      is_primary = case when p_is_primary then true else is_primary end,
      verified_at = case when v_reset then null else verified_at end,
      verified_by = case when v_reset then null else verified_by end
    where id = p_id
    returning * into v_after;
  end if;

  perform public.ensure_single_primary(v_elder);

  if v_before.id is not null
    and to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at'
  then
    return v_after.id;
  end if;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, before_summary, after_summary)
  values (
    auth.uid(), v_elder, 'emergency_number.upserted', 'emergency_numbers', v_after.id,
    case when v_before.id is null then null else jsonb_build_object(
      'category', v_before.category,
      'verified', v_before.verified_at is not null,
      'is_active', v_before.is_active
    ) end,
    jsonb_build_object(
      'category', v_after.category,
      'verified', v_after.verified_at is not null,
      'is_active', v_after.is_active
    )
  );

  return v_after.id;
end;
$$;

create or replace function public.reorder_emergency_numbers(p_elder_id uuid, p_order uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active uuid[];
  v_count integer;
  v_max integer;
  v_offset integer;
  i integer;
begin
  if p_elder_id is null then
    raise exception 'elder id is required' using errcode = 'check_violation';
  end if;
  if not public.is_manager_of(p_elder_id) then
    raise exception 'only the linked manager can reorder emergency numbers'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emergency_numbers:' || p_elder_id::text, 0));

  select coalesce(array_agg(id order by priority), '{}'::uuid[]), count(*), coalesce(max(priority), 0)
    into v_active, v_count, v_max
  from public.emergency_numbers
  where elder_id = p_elder_id and is_active;

  if p_order is null or array_length(p_order, 1) is distinct from v_count then
    raise exception 'p_order must list every active number exactly once'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(p_order) as x(id) where x.id is null) then
    raise exception 'p_order may not contain null' using errcode = 'check_violation';
  end if;
  if (select count(distinct x.id) from unnest(p_order) as x(id)) <> v_count then
    raise exception 'p_order may not repeat an id' using errcode = 'check_violation';
  end if;
  if not (p_order @> v_active and v_active @> p_order) then
    raise exception 'p_order must match the active set exactly' using errcode = 'check_violation';
  end if;

  if v_active = p_order then
    return; -- no-op, no audit row
  end if;

  -- Phase 1: move every active row out of the target range (a direct assign
  -- would collide with the (elder_id, priority) unique index on a swap).
  v_offset := v_max + v_count + 1;
  update public.emergency_numbers set priority = priority + v_offset
    where elder_id = p_elder_id and is_active;

  -- Phase 2: assign 0..n-1 by the requested order.
  for i in 1..v_count loop
    update public.emergency_numbers set priority = i - 1
      where id = p_order[i] and elder_id = p_elder_id and is_active;
  end loop;

  insert into public.audit_events (actor_id, elder_id, action, target_table, after_summary)
  values (auth.uid(), p_elder_id, 'emergency_numbers.reordered', 'emergency_numbers',
          jsonb_build_object('active_count', v_count));
end;
$$;

create or replace function public.set_emergency_number_verified(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_row public.emergency_numbers;
begin
  select elder_id into v_elder from public.emergency_numbers where id = p_id;
  if v_elder is null then
    raise exception 'emergency number not found' using errcode = 'no_data_found';
  end if;
  if not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can verify an emergency number'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emergency_numbers:' || v_elder::text, 0));

  select * into v_row from public.emergency_numbers where id = p_id for update;
  if v_row.id is null then
    raise exception 'emergency number not found' using errcode = 'no_data_found';
  end if;
  if v_row.verified_at is not null and v_row.verified_by is not null then
    return; -- already verified; no-op
  end if;

  update public.emergency_numbers
    set verified_at = now(), verified_by = auth.uid()
    where id = p_id;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, after_summary)
  values (auth.uid(), v_elder, 'emergency_number.verified', 'emergency_numbers', p_id,
          jsonb_build_object('category', v_row.category));
end;
$$;

create or replace function public.deactivate_emergency_number(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_row public.emergency_numbers;
begin
  select elder_id into v_elder from public.emergency_numbers where id = p_id;
  if v_elder is null then
    raise exception 'emergency number not found' using errcode = 'no_data_found';
  end if;
  if not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can deactivate an emergency number'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emergency_numbers:' || v_elder::text, 0));

  select * into v_row from public.emergency_numbers where id = p_id for update;
  if v_row.id is null then
    raise exception 'emergency number not found' using errcode = 'no_data_found';
  end if;
  if not v_row.is_active then
    return; -- already inactive; no-op
  end if;

  update public.emergency_numbers set is_active = false where id = p_id;

  -- If the primary was deactivated, promote the next-highest survivor.
  perform public.ensure_single_primary(v_elder);

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, before_summary, after_summary)
  values (auth.uid(), v_elder, 'emergency_number.deactivated', 'emergency_numbers', p_id,
          jsonb_build_object('category', v_row.category, 'is_active', true, 'reason', p_reason),
          jsonb_build_object('category', v_row.category, 'is_active', false, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: read-only for the client; the RPCs are the only write path.
-- ---------------------------------------------------------------------------

revoke all on public.elder_profiles, public.emergency_numbers from anon;
revoke insert, update, delete on public.elder_profiles, public.emergency_numbers from authenticated;
grant select on public.elder_profiles, public.emergency_numbers to authenticated;

-- Supabase's default privileges grant EXECUTE on new functions explicitly to
-- `authenticated` (not only via PUBLIC), so every new function is revoked from
-- all three roles and only the public API is granted back.
revoke execute on function
  public.ensure_single_primary(uuid),
  public.upsert_elder_profile(uuid, date, text, text, text, text, text, text, text, text, text, text, text, text),
  public.upsert_emergency_number(uuid, text, text, text, integer, boolean, uuid),
  public.reorder_emergency_numbers(uuid, uuid[]),
  public.set_emergency_number_verified(uuid),
  public.deactivate_emergency_number(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.upsert_elder_profile(uuid, date, text, text, text, text, text, text, text, text, text, text, text, text),
  public.upsert_emergency_number(uuid, text, text, text, integer, boolean, uuid),
  public.reorder_emergency_numbers(uuid, uuid[]),
  public.set_emergency_number_verified(uuid),
  public.deactivate_emergency_number(uuid, text)
  to authenticated;
