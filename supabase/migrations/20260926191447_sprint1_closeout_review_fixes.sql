-- Sprint 1 closeout review fixes (adversarial + independent review, 2026-09-27).
--
-- Two fixes to 20260926190008_sprint1_security_corrections.sql, shipped as a
-- forward migration rather than edited into already-applied history:
--
--   1. An account with no active profile (deactivated or missing) was still
--      "evaluated" by redeem_care_link_code: `NULL NOT IN (...)` is NULL, so
--      the early return did not fire. Such a caller cannot match an invite, so
--      it must return the uniform invalid result without taking the rate-limit
--      gate, auditing a failure, or counting against its own window.
--   2. The actor-visible failure audit carried `email_mismatch` when a guessed
--      code matched an email-bound open invite. The actor can read their own
--      audit rows, so that reason was an existence oracle for bound invites.
--      Every evaluated failure now records the same summary (`no_match`).

create or replace function public.redeem_care_link_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  c_max_failures constant int := 5;
  c_window constant interval := '15 minutes';
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
begin
  -- Uniform invalid without evaluating: malformed input and callers who can
  -- never match an invite (no active profile — including deactivated — or the
  -- caregiver role).
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select role into v_role from public.profiles
    where id = auth.uid() and deactivated_at is null;
  if v_role is null or v_role not in ('elder', 'family_member') then
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
  -- state) and answer uniformly. The summary is deliberately identical for
  -- every failure class so the actor-visible audit row cannot reveal whether a
  -- code matched an invite or why it was rejected.
  insert into public.audit_events (actor_id, action, target_table, after_summary)
  values (
    auth.uid(),
    'care_link_invite.redeem_failed',
    'care_link_invites',
    jsonb_build_object('reason', 'no_match')
  );

  return jsonb_build_object('status', 'invalid');
end;
$$;
