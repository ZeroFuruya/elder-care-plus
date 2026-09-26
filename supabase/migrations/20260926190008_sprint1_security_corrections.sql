-- Sprint 1 security closeout (docs/specs/sprint-1.md, addendum "frozen 2026-09-27").
--
-- Three corrections the owner requires before Sprint 1 acceptance:
--   SC-1  sign-up needs an explicit, valid role — no silent "elder" default.
--   SC-2  consent, revoke and deactivation require a server-verifiable recent
--         password authentication (JWT amr password timestamp, 300 s).
--   SC-3  redemption stops burning other users' invites: the invite-level
--         attempt counter is gone, failures are rate-limited per account and
--         derived from the failure audit rows, responses are uniform, the
--         invite is never touched by an invalid attempt, and clients cannot
--         read code_hash.
--
-- The base migrations are already applied, so this is a forward-only migration
-- (docs/01-dev-environment.md section 8.1).

-- ---------------------------------------------------------------------------
-- SC-2: recent password authentication.
--
-- auth.jwt() -> 'amr' records how the session last authenticated. A password
-- entry's timestamp is the last actual password entry: a token refresh renews
-- `iat` but leaves it untouched (verified locally 2026-09-27). Fails closed on
-- anything missing or malformed, and rejects future timestamps.
-- ---------------------------------------------------------------------------

create or replace function public.assert_recent_password_auth(p_max_age_seconds int default 300)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_amr jsonb := auth.jwt() -> 'amr';
  v_ts bigint;
begin
  if p_max_age_seconds is null or p_max_age_seconds < 1 or p_max_age_seconds > 3600 then
    raise exception 'invalid re-authentication window' using errcode = 'check_violation';
  end if;

  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    raise exception 're-authentication required' using errcode = 'insufficient_privilege';
  end if;

  select max(
           case
             when (e ->> 'timestamp') ~ '^[0-9]{1,12}$'
               then (e ->> 'timestamp')::bigint
           end
         )
    into v_ts
    from jsonb_array_elements(v_amr) as e
   where e ->> 'method' = 'password';

  if v_ts is null
     or to_timestamp(v_ts) > now() + interval '60 seconds'
     or to_timestamp(v_ts) < now() - make_interval(secs => p_max_age_seconds) then
    raise exception 're-authentication required' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.assert_recent_password_auth(int) is
  'Raises insufficient_privilege unless the access token shows a password authentication no older than the window. Internal to guarded RPCs.';

-- ---------------------------------------------------------------------------
-- SC-1: a sign-up role is mandatory and must be exact.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := nullif(new.raw_user_meta_data ->> 'role', '');
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );
begin
  if v_role is null then
    raise exception 'sign-up role is required' using errcode = 'check_violation';
  end if;

  if v_role not in ('caregiver', 'elder', 'family_member') then
    raise exception 'invalid sign-up role: %', v_role using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, v_name);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- SC-2: the three sensitive RPCs check recent authentication first.
-- (Bodies below match the base migration otherwise.)
-- ---------------------------------------------------------------------------

create or replace function public.consent_to_care_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.care_links;
begin
  perform public.assert_recent_password_auth();

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

create or replace function public.revoke_care_link(p_link_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.care_links;
begin
  perform public.assert_recent_password_auth();

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

create or replace function public.deactivate_account(p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  perform public.assert_recent_password_auth();

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
-- SC-3: redemption. Invite-level attempt counters are removed; the created
-- link id is recorded on the invite so a replay is exact.
-- ---------------------------------------------------------------------------

alter table public.care_link_invites
  drop column attempts,
  drop column max_attempts,
  add column consumed_link_id uuid references public.care_links (id) on delete restrict;

create index audit_events_redeem_failures
  on public.audit_events (actor_id, created_at)
  where action = 'care_link_invite.redeem_failed';

-- The return type changes, so the old function is dropped and recreated
-- (CREATE OR REPLACE cannot change a return type).
drop function public.redeem_care_link_code(text);

create function public.redeem_care_link_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  c_max_failures constant int := 5;
  c_window constant interval := interval '15 minutes';
  v_role text;
  v_email text;
  v_failures int;
  v_oldest timestamptz;
  v_retry int;
  v_replay_link uuid;
  v_replay_status text;
  v_candidate record;
  v_invite public.care_link_invites;
  v_link_id uuid;
  v_link_status text;
  v_saw_email_mismatch boolean := false;
begin
  -- Uniform invalid without evaluating: malformed input and callers who can
  -- never match an invite (no active profile, caregiver).
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select role into v_role from public.profiles
    where id = auth.uid() and deactivated_at is null;
  if v_role not in ('elder', 'family_member') then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- One redemption action per account at a time: the rate check, the replay
  -- lookup and consumption must see a consistent state.
  perform pg_advisory_xact_lock(hashtextextended('care_link_redeem:' || auth.uid()::text, 0));

  -- Rate limit derived from the failure audit rows, so refusing a call writes
  -- nothing and cannot extend its own cooldown.
  select count(*), min(created_at) into v_failures, v_oldest
  from public.audit_events
  where actor_id = auth.uid()
    and action = 'care_link_invite.redeem_failed'
    and created_at >= now() - c_window;

  if v_failures >= c_max_failures then
    v_retry := greatest(1, ceil(extract(epoch from (v_oldest + c_window - now())))::int);
    return jsonb_build_object('status', 'rate_limited', 'retry_after_seconds', v_retry);
  end if;

  -- Idempotent replay by the same redeemer: return the exact link this code
  -- already created, with the link's current status.
  select i.consumed_link_id, cl.status
    into v_replay_link, v_replay_status
    from public.care_link_invites i
    join public.care_links cl on cl.id = i.consumed_link_id
   where i.consumed_by = auth.uid()
     and i.consumed_at is not null
     and i.consumed_link_id is not null
     and (
       (i.grants_member_role = 'caregiver' and v_role = 'elder')
       or (i.grants_member_role = 'family_member' and v_role = 'family_member')
     )
     and i.code_hash = extensions.crypt(p_code, i.code_hash)
   order by i.consumed_at desc
   limit 1;

  if v_replay_link is not null then
    return jsonb_build_object('status', v_replay_status, 'link_id', v_replay_link);
  end if;

  -- An elder who already has an active manager cannot form another link; no
  -- invite could match, so this is not evaluated and not counted.
  if v_role = 'elder' and exists (
    select 1 from public.care_links
    where elder_id = auth.uid() and member_role = 'caregiver' and status = 'active'
  ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Candidate open invites: the code is compared per open invite for this
  -- role; only bcrypt hashes are stored, never a plaintext code.
  for v_candidate in
    select i.id
      from public.care_link_invites i
     where i.consumed_at is null
       and i.expires_at > now()
       and (
         (i.grants_member_role = 'caregiver' and v_role = 'elder')
         or (i.grants_member_role = 'family_member' and v_role = 'family_member')
       )
       and i.code_hash = extensions.crypt(p_code, i.code_hash)
     order by i.created_at desc
  loop
    -- Re-read under lock: another session may have consumed it meanwhile.
    select * into v_invite
      from public.care_link_invites
     where id = v_candidate.id
     for update;

    if v_invite.consumed_at is not null or v_invite.expires_at <= now() then
      continue;
    end if;

    if v_invite.invitee_email is not null then
      select lower(trim(email)) into v_email from auth.users where id = auth.uid();
      if v_email is null or v_email is distinct from v_invite.invitee_email then
        v_saw_email_mismatch := true;
        continue;
      end if;
    end if;

    if v_role = 'elder' then
      -- The elder's redemption is their consent, so the link activates now.
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

      v_link_status := 'active';
    else
      -- The family member has accepted; the elder must still consent. If a
      -- live link for this pair already exists, a second one cannot be created
      -- (unique index); leave the invite open and treat it as a failed match.
      if exists (
        select 1 from public.care_links
        where elder_id = v_invite.elder_id
          and member_id = auth.uid()
          and status <> 'revoked'
      ) then
        continue;
      end if;

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

      v_link_status := 'invited';
    end if;

    update public.care_link_invites
      set consumed_at = now(), consumed_by = auth.uid(), consumed_link_id = v_link_id
      where id = v_invite.id;

    return jsonb_build_object('status', v_link_status, 'link_id', v_link_id);
  end loop;

  -- No eligible candidate: record the evaluated failure (this is also the rate
  -- state) and answer uniformly, whether the reason was no match, an expired
  -- invite or an email mismatch.
  insert into public.audit_events (actor_id, action, target_table, after_summary)
  values (
    auth.uid(),
    'care_link_invite.redeem_failed',
    'care_link_invites',
    jsonb_build_object(
      'reason',
      case when v_saw_email_mismatch then 'email_mismatch' else 'no_match' end
    )
  );

  return jsonb_build_object('status', 'invalid');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the changed objects.
-- ---------------------------------------------------------------------------

-- Invite metadata only: a table-level SELECT would keep code_hash readable
-- regardless of a later column-level revoke, so the grant is replaced.
revoke select on public.care_link_invites from authenticated;
grant select (
  id, created_by, elder_id, grants_member_role, invitee_email,
  expires_at, consumed_at, consumed_by, created_at
) on public.care_link_invites to authenticated;

-- The re-auth helper is internal to the guarded RPCs; the redemption grant is
-- recreated after its type change.
revoke execute on function
  public.assert_recent_password_auth(int),
  public.redeem_care_link_code(text)
  from public, anon, authenticated;

grant execute on function public.redeem_care_link_code(text) to authenticated;
