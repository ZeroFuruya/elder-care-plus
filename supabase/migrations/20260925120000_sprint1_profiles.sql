-- Sprint 1 (1/3): profiles.
--
-- One row per auth user. `role` is the person's account type for the whole
-- product (caregiver, elder, or connected family member — docs/adr/adr-001) and
-- is set once, from sign-up metadata, by the trigger below. It is never trusted
-- from, or changeable by, client state.
--
-- Schema changes ship with their RLS policies and tests
-- (docs/01-dev-environment.md section 8.1, Definition of Done).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  role text not null check (role in ('caregiver', 'elder', 'family_member')),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

comment on table public.profiles is
  'One row per auth user. role is immutable after insert; accounts are deactivated, never deleted.';

-- Keep updated_at honest without relying on the client.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Role and identity are set once. A client may rename itself; it may not re-role
-- itself, and it may not reactivate a deactivated account.
create or replace function public.profiles_guard_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = 'check_violation';
  end if;
  if new.role is distinct from old.role then
    raise exception 'profiles.role is immutable' using errcode = 'check_violation';
  end if;
  if old.deactivated_at is not null and new.deactivated_at is null then
    raise exception 'an account cannot be reactivated from the client'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_immutable_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_immutable_columns();

-- Mirror each new auth user into public.profiles. An unknown role is rejected
-- rather than defaulted, so a bad sign-up cannot become a caregiver by accident.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'elder');
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );
begin
  if v_role not in ('caregiver', 'elder', 'family_member') then
    raise exception 'invalid sign-up role: %', v_role using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, v_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
