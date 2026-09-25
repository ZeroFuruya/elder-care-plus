-- Sprint 1 (3/3): audit trail, RLS, helpers and the guarded RPCs.
--
-- Rules enforced here (AGENTS.md hard rules):
--   * RLS on every table, default deny; no DELETE policy anywhere.
--   * Every audited write goes through a security-definer RPC, never a direct
--     table write.
--   * Medical history is never hard-deleted.
--   * The elder confirms only their own link, through a guarded RPC.

-- ---------------------------------------------------------------------------
-- Audit trail. Append-only, scoped to an elder so RLS can filter it.
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete restrict,
  elder_id uuid references public.profiles (id) on delete restrict,
  action text not null,
  target_table text not null,
  target_id uuid,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only trail. Confirmed doses, stock adjustments, verifications and care-plan changes land here.';

create index audit_events_by_target on public.audit_events (target_table, target_id);
create index audit_events_by_elder on public.audit_events (elder_id, created_at desc);

create or replace function public.audit_events_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_events is append-only (% is not permitted)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_no_update_or_delete
  before update or delete on public.audit_events
  for each row execute function public.audit_events_append_only();

-- ---------------------------------------------------------------------------
-- Helpers. security definer so a policy on care_links cannot recurse, and so a
-- caller cannot influence the answer by editing their own rows.
-- ---------------------------------------------------------------------------

create or replace function public.is_elder_self(p_elder uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() = p_elder;
$$;

create or replace function public.is_manager_of(p_elder uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.care_links cl
    where cl.elder_id = p_elder
      and cl.member_id = auth.uid()
      and cl.member_role = 'caregiver'
      and cl.access_level = 'manage'
      and cl.status = 'active'
  );
$$;

create or replace function public.is_active_member_of(p_elder uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.care_links cl
    where cl.elder_id = p_elder
      and cl.member_id = auth.uid()
      and cl.status = 'active'
  );
$$;

-- Can the current user see this profile? Self, the elder they belong to, a
-- fellow active member of the same circle, or a member of their own circle.
create or replace function public.can_view_profile(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_id = auth.uid()
    or exists (
      select 1 from public.care_links cl
      where cl.member_id = auth.uid() and cl.elder_id = p_id and cl.status = 'active'
    )
    or exists (
      select 1
      from public.care_links me
      join public.care_links other on other.elder_id = me.elder_id
      where me.member_id = auth.uid() and me.status = 'active'
        and other.member_id = p_id and other.status = 'active'
    )
    or exists (
      select 1 from public.care_links cl
      where cl.elder_id = auth.uid() and cl.member_id = p_id and cl.status = 'active'
    );
$$;

-- Six random digits. The attempt cap and short expiry are the real protection;
-- see the entropy note in docs/specs/sprint-1.md.
create or replace function public.generate_link_code()
returns text
language sql volatile
set search_path = extensions, pg_temp
as $$
  select lpad(
    (abs((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000))::text,
    6,
    '0'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: default deny, plus a select policy. Writes are RPC-only, so no table
-- gets an insert/update/delete policy. There is no delete policy anywhere.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.care_links enable row level security;
alter table public.care_link_invites enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (public.can_view_profile(id));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy care_links_select on public.care_links
  for select to authenticated
  using (elder_id = auth.uid() or member_id = auth.uid());

create policy care_link_invites_select on public.care_link_invites
  for select to authenticated
  using (created_by = auth.uid() or elder_id = auth.uid());

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    actor_id = auth.uid()
    or (elder_id is not null and (elder_id = auth.uid() or public.is_manager_of(elder_id)))
  );

-- ---------------------------------------------------------------------------
-- Grants: read-only for the client, and only full_name is updatable.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.care_links, public.care_link_invites, public.audit_events
  from anon;
revoke insert, update, delete on public.care_links, public.care_link_invites from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;
revoke insert, update, delete on public.profiles from authenticated;

grant select on public.profiles, public.care_links, public.care_link_invites, public.audit_events
  to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs. Every one of these is the only way to change its table.
-- ---------------------------------------------------------------------------

-- A caregiver, with no elder yet, issues a code an older adult can redeem.
create or replace function public.create_elder_link_invite(p_invitee_email text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_role text;
  v_code text;
  v_invite_id uuid;
  v_email text := nullif(lower(trim(p_invitee_email)), '');
begin
  select role into v_role from public.profiles
    where id = auth.uid() and deactivated_at is null;

  if v_role is null then
    raise exception 'no active account' using errcode = 'insufficient_privilege';
  end if;
  if v_role <> 'caregiver' then
    raise exception 'only a caregiver account can invite an elder' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.care_links
    where member_id = auth.uid() and member_role = 'caregiver' and status = 'active'
  ) then
    raise exception 'this caregiver already has a linked elder' using errcode = 'unique_violation';
  end if;

  -- Invalidate any still-open invite this caregiver issued.
  update public.care_link_invites
    set expires_at = now()
    where created_by = auth.uid() and consumed_at is null and expires_at > now();

  v_code := public.generate_link_code();

  insert into public.care_link_invites (created_by, grants_member_role, invitee_email, code_hash, expires_at)
  values (auth.uid(), 'caregiver', v_email,
          extensions.crypt(v_code, extensions.gen_salt('bf')), now() + interval '24 hours')
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, target_table, target_id, after_summary)
  values (auth.uid(), 'care_link_invite.created', 'care_link_invites', v_invite_id,
          jsonb_build_object('grants_member_role', 'caregiver', 'invitee_email', v_email));

  return v_code;
end;
$$;

-- The elder's manager invites a connected family member into the circle.
create or replace function public.invite_family_member(p_invitee_email text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_elder uuid;
  v_code text;
  v_invite_id uuid;
  v_email text := nullif(lower(trim(p_invitee_email)), '');
begin
  select elder_id into v_elder from public.care_links
    where member_id = auth.uid() and member_role = 'caregiver' and status = 'active'
    limit 1;

  if v_elder is null then
    raise exception 'only a linked caregiver can invite a family member' using errcode = 'insufficient_privilege';
  end if;

  update public.care_link_invites
    set expires_at = now()
    where created_by = auth.uid() and elder_id = v_elder
      and grants_member_role = 'family_member'
      and consumed_at is null and expires_at > now();

  v_code := public.generate_link_code();

  insert into public.care_link_invites (created_by, elder_id, grants_member_role, invitee_email, code_hash, expires_at)
  values (auth.uid(), v_elder, 'family_member', v_email,
          extensions.crypt(v_code, extensions.gen_salt('bf')), now() + interval '24 hours')
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, after_summary)
  values (auth.uid(), v_elder, 'care_link_invite.created', 'care_link_invites', v_invite_id,
          jsonb_build_object('grants_member_role', 'family_member', 'invitee_email', v_email));

  return v_code;
end;
$$;

-- Redeem a code. Returns the care_links id, or NULL if the code is not valid.
-- Failures never raise: an exception would roll back the attempt counter.
-- A replay by the same user returns the link it already created (idempotent).
create or replace function public.redeem_care_link_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_role text;
  v_invite public.care_link_invites;
  v_email text;
  v_link_id uuid;
begin
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return null;
  end if;

  select role into v_role from public.profiles
    where id = auth.uid() and deactivated_at is null;
  if v_role not in ('elder', 'family_member') then
    return null;
  end if;

  select * into v_invite
  from public.care_link_invites i
  where i.consumed_at is null
    and i.expires_at > now()
    and i.attempts < i.max_attempts
    and (
      (i.grants_member_role = 'caregiver' and v_role = 'elder')
      or (i.grants_member_role = 'family_member' and v_role = 'family_member')
    )
    and i.code_hash = extensions.crypt(p_code, i.code_hash)
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    -- No open invite matched. If this user already redeemed this exact code, be
    -- idempotent rather than failing a retry.
    select cl.id into v_link_id
    from public.care_link_invites i
    join public.care_links cl
      on cl.elder_id = coalesce(i.elder_id, i.consumed_by)
     and cl.member_id = case
           when i.grants_member_role = 'caregiver' then i.created_by
           else i.consumed_by
         end
    where i.consumed_by = auth.uid()
      and (
        (i.grants_member_role = 'caregiver' and v_role = 'elder')
        or (i.grants_member_role = 'family_member' and v_role = 'family_member')
      )
      and i.code_hash = extensions.crypt(p_code, i.code_hash)
    order by i.consumed_at desc
    limit 1;

    if v_link_id is not null then
      return v_link_id;
    end if;

    -- Burn an attempt against the newest open invite for this role. Codes are not
    -- attributable without a match, so this bounds guessing globally per role.
    update public.care_link_invites
      set attempts = attempts + 1
      where id = (
        select id from public.care_link_invites
        where consumed_at is null and expires_at > now()
          and ((grants_member_role = 'caregiver' and v_role = 'elder')
            or (grants_member_role = 'family_member' and v_role = 'family_member'))
        order by created_at desc
        limit 1
      );
    return null;
  end if;

  -- Email binding, when the invitee address was given.
  if v_invite.invitee_email is not null then
    select lower(email) into v_email from auth.users where id = auth.uid();
    if v_email is distinct from v_invite.invitee_email then
      update public.care_link_invites set attempts = attempts + 1 where id = v_invite.id;
      return null;
    end if;
  end if;

  if v_role = 'elder' then
    -- The elder's redemption is their consent, so the link activates now.
    if exists (
      select 1 from public.care_links
      where elder_id = auth.uid() and member_role = 'caregiver' and status = 'active'
    ) then
      return null;
    end if;

    insert into public.care_links (
      elder_id, member_id, member_role, access_level, status,
      invited_by, member_consent_at, elder_consent_at, activated_at
    ) values (
      auth.uid(), v_invite.created_by, 'caregiver', 'manage', 'active',
      v_invite.created_by, now(), now(), now()
    )
    returning id into v_link_id;

    insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, after_summary)
    values (auth.uid(), auth.uid(), 'care_link.activated', 'care_links', v_link_id,
            jsonb_build_object('member_role', 'caregiver'));
  else
    -- The family member has accepted; the elder must still consent.
    insert into public.care_links (
      elder_id, member_id, member_role, access_level, status, invited_by, member_consent_at
    ) values (
      v_invite.elder_id, auth.uid(), 'family_member', 'view', 'invited',
      v_invite.created_by, now()
    )
    returning id into v_link_id;

    insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, after_summary)
    values (auth.uid(), v_invite.elder_id, 'care_link.redeemed', 'care_links', v_link_id,
            jsonb_build_object('member_role', 'family_member'));
  end if;

  update public.care_link_invites
    set consumed_at = now(), consumed_by = auth.uid()
    where id = v_invite.id;

  return v_link_id;
end;
$$;

-- The elder consents to a family-member link; it becomes active.
create or replace function public.consent_to_care_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.care_links;
begin
  select * into v_link from public.care_links where id = p_link_id;

  if v_link.id is null then
    raise exception 'link not found' using errcode = 'no_data_found';
  end if;
  if v_link.elder_id <> auth.uid() then
    raise exception 'only the elder can consent to this link' using errcode = 'insufficient_privilege';
  end if;
  if v_link.elder_consent_at is not null then
    return; -- already consented; idempotent
  end if;
  if v_link.status <> 'invited' then
    raise exception 'link is not awaiting consent' using errcode = 'check_violation';
  end if;

  update public.care_links
    set elder_consent_at = now(),
        status = 'active',
        activated_at = now()
    where id = p_link_id;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, after_summary)
  values (auth.uid(), v_link.elder_id, 'care_link.consented', 'care_links', p_link_id,
          jsonb_build_object('member_role', v_link.member_role));
end;
$$;

-- Revoke a link. The elder or the manager may do it; history is kept.
create or replace function public.revoke_care_link(p_link_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.care_links;
begin
  select * into v_link from public.care_links where id = p_link_id;

  if v_link.id is null then
    raise exception 'link not found' using errcode = 'no_data_found';
  end if;
  if v_link.elder_id <> auth.uid() and not public.is_manager_of(v_link.elder_id) then
    raise exception 'only the elder or their manager can revoke this link'
      using errcode = 'insufficient_privilege';
  end if;
  if v_link.status = 'revoked' then
    return; -- idempotent
  end if;

  update public.care_links
    set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
    where id = p_link_id;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, before_summary, after_summary)
  values (auth.uid(), v_link.elder_id, 'care_link.revoked', 'care_links', p_link_id,
          jsonb_build_object('status', v_link.status), jsonb_build_object('status', 'revoked', 'reason', p_reason));
end;
$$;

-- Deactivate the caller's own account: revoke every live link, then soft-delete.
-- Nothing is removed from the database.
create or replace function public.deactivate_account(p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    raise exception 'no active account' using errcode = 'insufficient_privilege';
  end if;

  update public.care_links
    set status = 'revoked',
        revoked_at = now(),
        revoked_by = auth.uid(),
        revoke_reason = coalesce(p_reason, 'account deactivated')
    where status <> 'revoked' and (elder_id = auth.uid() or member_id = auth.uid());

  update public.profiles
    set deactivated_at = now()
    where id = auth.uid() and deactivated_at is null;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, after_summary)
  values (auth.uid(), case when v_role = 'elder' then auth.uid() end,
          'account.deactivated', 'profiles', auth.uid(),
          jsonb_build_object('role', v_role, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: the client may call only the public API and the helpers
-- the policies need.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.touch_updated_at(),
  public.profiles_guard_immutable_columns(),
  public.handle_new_user(),
  public.audit_events_append_only(),
  public.generate_link_code(),
  public.is_elder_self(uuid),
  public.is_manager_of(uuid),
  public.is_active_member_of(uuid),
  public.can_view_profile(uuid),
  public.create_elder_link_invite(text),
  public.invite_family_member(text),
  public.redeem_care_link_code(text),
  public.consent_to_care_link(uuid),
  public.revoke_care_link(uuid, text),
  public.deactivate_account(text)
  from public, anon;

grant execute on function
  public.is_elder_self(uuid),
  public.is_manager_of(uuid),
  public.is_active_member_of(uuid),
  public.can_view_profile(uuid),
  public.create_elder_link_invite(text),
  public.invite_family_member(text),
  public.redeem_care_link_code(text),
  public.consent_to_care_link(uuid),
  public.revoke_care_link(uuid, text),
  public.deactivate_account(text)
  to authenticated;
