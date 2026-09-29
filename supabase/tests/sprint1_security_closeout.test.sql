-- Sprint 1 security closeout (pgTAP). Run with: npx supabase test db
--
-- Covers the frozen addendum in docs/specs/sprint-1.md:
--   SC-2  server-verifiable re-authentication for consent, revoke and
--         deactivation (JWT amr password timestamp, 300 s, fail closed);
--   SC-3  redemption abuse protection: per-account rate limit from the failure
--         audit rows, uniform failures, invites untouched by invalid attempts,
--         exact replay results, code_hash hidden from clients.
--
-- SC-1 (mandatory sign-up role) is in sprint1_accounts_and_care_circle.test.sql.
-- All fixtures are synthetic. Timestamps come from the clock, never hard-coded.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(80);

-- JWT claims helper: p_pw_age_seconds null omits amr entirely; otherwise it is
-- a password entry that many seconds old.
create function pg_temp.set_claims(p_sub text, p_pw_age_seconds int default null)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(
      jsonb_build_object(
        'sub', p_sub,
        'amr', case
                 when p_pw_age_seconds is null then null
                 else jsonb_build_array(
                   jsonb_build_object(
                     'method', 'password',
                     'timestamp',
                     floor(extract(epoch from clock_timestamp()))::bigint - p_pw_age_seconds
                   ))
               end
      )
    )::text,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'cg1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Closeout Caregiver One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'e1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b3333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'f1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"family_member","full_name":"Closeout Family One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b4444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'e2@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b5555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'cg2@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Closeout Caregiver Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b6666666-6666-4666-8666-666666666666',
   'authenticated', 'authenticated', 'e3@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder Three"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b7777777-7777-4777-8777-777777777777',
   'authenticated', 'authenticated', 'e4@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder Four"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b8888888-8888-4888-8888-888888888888',
   'authenticated', 'authenticated', 'e5@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder Five"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9999999-9999-4999-8999-999999999999',
   'authenticated', 'authenticated', 'cg3@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Closeout Caregiver Three"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'e6@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder Six"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'cg4@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Closeout Caregiver Four"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'authenticated', 'authenticated', 'cg5@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Closeout Caregiver Five"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bddddddd-dddd-4ddd-8ddd-dddddddddddd',
   'authenticated', 'authenticated', 'f2@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"family_member","full_name":"Closeout Family Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'beeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   'authenticated', 'authenticated', 'e7@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Closeout Elder Seven"}', now(), now());

set local role authenticated;

-- ---------------------------------------------------------------------------
-- SC-2: a link and a family invite to exercise the guarded RPCs.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('b1111111-1111-4111-8111-111111111111');
select set_config('closeout.code_a', public.create_elder_link_invite(), true);

select pg_temp.set_claims('b2222222-2222-4222-8222-222222222222');
select set_config(
  'closeout.link_l1',
  coalesce(public.redeem_care_link_code(current_setting('closeout.code_a')) ->> 'link_id', ''),
  true);

-- 1.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l1')::uuid),
  'active', 'the elder link activates on redemption');

-- 2.
select isnt(
  current_setting('closeout.link_l1'), ''::text,
  'the elder link id was captured');

select pg_temp.set_claims('b1111111-1111-4111-8111-111111111111');
select set_config('closeout.code_b', public.invite_family_member(), true);

select pg_temp.set_claims('b3333333-3333-4333-8333-333333333333');
select set_config(
  'closeout.link_l2',
  coalesce(public.redeem_care_link_code(current_setting('closeout.code_b')) ->> 'link_id', ''),
  true);

-- 3.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l2')::uuid),
  'invited', 'the family link starts as invited');

-- Missing amr is refused and changes nothing.
select pg_temp.set_claims('b2222222-2222-4222-8222-222222222222');

-- 4.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'consent without re-authentication is refused');

-- 5.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l2')::uuid),
  'invited', 'the refused consent changed nothing');

-- 6.
select throws_ok(
  format('select public.revoke_care_link(%L::uuid)', current_setting('closeout.link_l1')),
  '42501', 're-authentication required',
  'revoke without re-authentication is refused');

-- 7.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l1')::uuid),
  'active', 'the refused revoke changed nothing');

-- A stale password timestamp (10 minutes) is refused.
select pg_temp.set_claims('b2222222-2222-4222-8222-222222222222', 600);

-- 8.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'a stale password timestamp is refused for consent');

-- 9.
select throws_ok(
  format('select public.revoke_care_link(%L::uuid)', current_setting('closeout.link_l1')),
  '42501', 're-authentication required',
  'a stale password timestamp is refused for revoke');

-- Malformed amr claims fail closed.
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","amr":"password"}', 'b2222222-2222-4222-8222-222222222222'), true);

-- 10.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'a non-array amr is refused');

select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","amr":[{"method":"password"}]}', 'b2222222-2222-4222-8222-222222222222'),
  true);

-- 11.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'an amr entry without a timestamp is refused');

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"%s","amr":[{"method":"password","timestamp":"soon"}]}',
    'b2222222-2222-4222-8222-222222222222'),
  true);

-- 12.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'a non-numeric amr timestamp is refused');

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"%s","amr":[{"method":"password","timestamp":%s}]}',
    'b2222222-2222-4222-8222-222222222222',
    floor(extract(epoch from clock_timestamp()))::bigint + 600),
  true);

-- 13.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'a future amr timestamp is refused');

select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"%s","amr":[{"method":"token_refresh","timestamp":%s}]}',
    'b2222222-2222-4222-8222-222222222222',
    floor(extract(epoch from clock_timestamp()))::bigint),
  true);

-- 14.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'a non-password amr method is refused');

-- Authorization is still checked after re-authentication.
select pg_temp.set_claims('b4444444-4444-4444-8444-444444444444', 0);

-- 15.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 'only the elder can consent to this link',
  'another elder cannot consent even with fresh authentication');

-- The helper itself is never client-callable.
select pg_temp.set_claims('b4444444-4444-4444-8444-444444444444', 0);

-- 16.
select throws_ok(
  'select public.assert_recent_password_auth()',
  '42501', null, 'the re-authentication helper is not client-callable');

-- Fresh authentication lets the guarded writes through.
select pg_temp.set_claims('b2222222-2222-4222-8222-222222222222', 0);

-- 17.
select lives_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  'fresh re-authentication allows consent');

-- 18.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l2')::uuid),
  'active', 'the elder consent activates the family link');

-- A refreshed token keeps the old password timestamp, so it does not qualify.
select set_config(
  'request.jwt.claims',
  format(
    '{"sub":"%s","iat":%s,"amr":[{"method":"password","timestamp":%s}]}',
    'b2222222-2222-4222-8222-222222222222',
    floor(extract(epoch from clock_timestamp()))::bigint,
    floor(extract(epoch from clock_timestamp()))::bigint - 600),
  true);

-- 19.
select throws_ok(
  format('select public.consent_to_care_link(%L::uuid)', current_setting('closeout.link_l2')),
  '42501', 're-authentication required',
  'a refreshed token does not satisfy re-authentication');

select pg_temp.set_claims('b2222222-2222-4222-8222-222222222222', 0);

-- 20.
select lives_ok(
  format('select public.revoke_care_link(%L::uuid)', current_setting('closeout.link_l1')),
  'fresh re-authentication allows revoke');

-- 21.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l1')::uuid),
  'revoked', 'the elder revoke takes effect');

-- 22.
select lives_ok(
  format('select public.revoke_care_link(%L::uuid)', current_setting('closeout.link_l1')),
  'revoking an already revoked link stays idempotent');

-- Replay of a revoked link is exact.
select set_config(
  'closeout.replay_a',
  public.redeem_care_link_code(current_setting('closeout.code_a'))::text,
  true);

-- 23.
select is(
  (current_setting('closeout.replay_a')::jsonb ->> 'status'), 'revoked',
  'replaying a revoked link reports revoked');

-- 24.
select is(
  (current_setting('closeout.replay_a')::jsonb ->> 'link_id'), current_setting('closeout.link_l1'),
  'the replay returns the same link id');

-- 25.
select is(
  (select count(*) from public.care_links
    where elder_id = 'b2222222-2222-4222-8222-222222222222'
      and member_id = 'b1111111-1111-4111-8111-111111111111'),
  1::bigint, 'the replay creates no second link');

-- Deactivation requires re-authentication.
select pg_temp.set_claims('b8888888-8888-4888-8888-888888888888');

-- 26.
select throws_ok(
  'select public.deactivate_account()',
  '42501', 're-authentication required',
  'deactivation without re-authentication is refused');

-- 27.
select is(
  (select deactivated_at from public.profiles where id = 'b8888888-8888-4888-8888-888888888888'),
  null, 'the refused deactivation changed nothing');

select pg_temp.set_claims('b8888888-8888-4888-8888-888888888888', 600);

-- 28.
select throws_ok(
  'select public.deactivate_account()',
  '42501', 're-authentication required',
  'a stale password timestamp cannot deactivate');

-- 29.
select is(
  (select deactivated_at from public.profiles where id = 'b8888888-8888-4888-8888-888888888888'),
  null, 'the stale attempt still changed nothing');

select pg_temp.set_claims('b8888888-8888-4888-8888-888888888888', 0);

-- 30.
select lives_ok(
  'select public.deactivate_account()',
  'fresh re-authentication allows deactivation');

-- 31.
select ok(
  (select deactivated_at is not null from public.profiles
    where id = 'b8888888-8888-4888-8888-888888888888'),
  'the account is deactivated, not deleted');

-- ---------------------------------------------------------------------------
-- SC-3: the rate limit, the untouched invite, and independent accounts.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('b5555555-5555-4555-8555-555555555555');
select set_config('closeout.code_c', public.create_elder_link_invite(), true);

-- 32.
select matches(
  current_setting('closeout.code_c'), '^[0-9]{6}$'::text,
  'the second caregiver issues a six-digit code');

select pg_temp.set_claims('b4444444-4444-4444-8444-444444444444');

-- 33.
select is(
  public.redeem_care_link_code('000000'), '{"status": "invalid"}'::jsonb,
  'a wrong code returns the uniform invalid result');

do $$
begin
  for i in 1..4 loop
    perform public.redeem_care_link_code('000000');
  end loop;
end;
$$;

-- 34.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b4444444-4444-4444-8444-444444444444'
      and action = 'care_link_invite.redeem_failed'),
  5::bigint, 'five evaluated failures are audited');

-- 35.
select is(
  (select count(*) filter (where after_summary ? 'reason') from public.audit_events
    where actor_id = 'b4444444-4444-4444-8444-444444444444'
      and action = 'care_link_invite.redeem_failed'),
  5::bigint, 'each failure carries an internal reason');

select pg_temp.set_claims('b6666666-6666-4666-8666-666666666666');

-- 36.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b4444444-4444-4444-8444-444444444444'),
  0::bigint, 'another account cannot see the failure rows');

select pg_temp.set_claims('b4444444-4444-4444-8444-444444444444');

-- 37.
select is(
  (public.redeem_care_link_code('000000') ->> 'status'), 'rate_limited',
  'the sixth evaluated failure is rate limited');

-- 38.
select ok(
  ((public.redeem_care_link_code('000000') ->> 'retry_after_seconds')::int between 870 and 900),
  'the rate limit reports the remaining 15-minute cooldown');

-- 39.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b4444444-4444-4444-8444-444444444444'
      and action = 'care_link_invite.redeem_failed'),
  5::bigint, 'refused calls are not audited');

-- 40.
select is(
  (public.redeem_care_link_code(current_setting('closeout.code_c')) ->> 'status'), 'rate_limited',
  'a correct code is also refused during the cooldown');

-- 41.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b4444444-4444-4444-8444-444444444444'
      and action = 'care_link_invite.redeem_failed'),
  5::bigint, 'the refused correct code wrote nothing');

select pg_temp.set_claims('b5555555-5555-4555-8555-555555555555');

-- 42.
select ok(
  (select consumed_at is null from public.care_link_invites
    where created_by = 'b5555555-5555-4555-8555-555555555555'),
  'the open invite is untouched after the guessing');

-- 43.
select ok(
  (select expires_at > now() from public.care_link_invites
    where created_by = 'b5555555-5555-4555-8555-555555555555'),
  'the open invite did not expire');

select pg_temp.set_claims('b6666666-6666-4666-8666-666666666666');
select set_config(
  'closeout.link_l3',
  coalesce(public.redeem_care_link_code(current_setting('closeout.code_c')) ->> 'link_id', ''),
  true);

-- 44.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l3')::uuid),
  'active', 'the rightful redeemer links while the guesser is in cooldown');

-- 45.
select is(
  (select count(*) from public.care_links
    where elder_id = 'b6666666-6666-4666-8666-666666666666'
      and member_role = 'caregiver' and status = 'active'),
  1::bigint, 'the rightful redeemer has exactly one active manager');

-- ---------------------------------------------------------------------------
-- SC-3: aged-out failures stop counting; the audit trail keeps them.
-- ---------------------------------------------------------------------------

reset role;

insert into public.audit_events (actor_id, action, target_table, after_summary, created_at)
select
  'b7777777-7777-4777-8777-777777777777',
  'care_link_invite.redeem_failed',
  'care_link_invites',
  jsonb_build_object('reason', 'no_match'),
  now() - interval '16 minutes'
from generate_series(1, 5);

set local role authenticated;
select pg_temp.set_claims('b7777777-7777-4777-8777-777777777777');

-- 46.
select is(
  (public.redeem_care_link_code('000000') ->> 'status'), 'invalid',
  'aged-out failures do not block a new evaluation');

-- 47.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b7777777-7777-4777-8777-777777777777'
      and action = 'care_link_invite.redeem_failed'
      and created_at >= now() - interval '15 minutes'),
  1::bigint, 'only the new failure is inside the window');

-- 48.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b7777777-7777-4777-8777-777777777777'
      and action = 'care_link_invite.redeem_failed'),
  6::bigint, 'the aged-out failures stay in the audit trail');

-- ---------------------------------------------------------------------------
-- SC-3: email binding.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('b9999999-9999-4999-8999-999999999999');
select set_config('closeout.code_d', public.create_elder_link_invite('e6@example.test'), true);

select pg_temp.set_claims('b7777777-7777-4777-8777-777777777777');

-- 49.
select is(
  public.redeem_care_link_code(current_setting('closeout.code_d')),
  '{"status": "invalid"}'::jsonb,
  'a wrong email for the code is a uniform invalid');

select pg_temp.set_claims('b9999999-9999-4999-8999-999999999999');

-- 50.
select ok(
  (select consumed_at is null from public.care_link_invites
    where created_by = 'b9999999-9999-4999-8999-999999999999'),
  'the email mismatch did not consume the invite');

select pg_temp.set_claims('b7777777-7777-4777-8777-777777777777');

-- 51.
select is(
  (select after_summary ->> 'reason' from public.audit_events
    where actor_id = 'b7777777-7777-4777-8777-777777777777'
      and action = 'care_link_invite.redeem_failed'
    order by created_at desc
    limit 1),
  'no_match', 'the audit reason does not reveal an email mismatch');

select pg_temp.set_claims('baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config(
  'closeout.link_l4',
  coalesce(public.redeem_care_link_code(current_setting('closeout.code_d')) ->> 'link_id', ''),
  true);

-- 52.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l4')::uuid),
  'active', 'the bound email redeems successfully');

-- 53.
select is(
  (select count(*) from public.care_links
    where elder_id = 'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status = 'active'),
  1::bigint, 'the bound elder has one active link');

-- ---------------------------------------------------------------------------
-- SC-3: an elder who already has a manager cannot redeem, and that refusal is
-- not counted (no invite could ever match).
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('closeout.code_e', public.create_elder_link_invite(), true);

-- 54.
select matches(
  current_setting('closeout.code_e'), '^[0-9]{6}$'::text,
  'the fourth caregiver issues another six-digit code');

select pg_temp.set_claims('b6666666-6666-4666-8666-666666666666');

-- 55.
select is(
  public.redeem_care_link_code(current_setting('closeout.code_e')),
  '{"status": "invalid"}'::jsonb,
  'an elder with an active manager cannot redeem');

-- 56.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b6666666-6666-4666-8666-666666666666'
      and action = 'care_link_invite.redeem_failed'),
  0::bigint, 'that refusal is not counted as a guess');

select pg_temp.set_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- 57.
select ok(
  (select consumed_at is null from public.care_link_invites
    where created_by = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'the attempt left the invite untouched');

-- ---------------------------------------------------------------------------
-- SC-3: code_hash is not selectable by clients.
-- ---------------------------------------------------------------------------

reset role;

-- 58.
select is(
  has_column_privilege('authenticated', 'public.care_link_invites', 'code_hash', 'select'),
  false, 'authenticated cannot select code_hash');

-- 59.
select is(
  has_column_privilege('authenticated', 'public.care_link_invites', 'expires_at', 'select'),
  true, 'authenticated can select the invite metadata');

set local role authenticated;
select pg_temp.set_claims('b7777777-7777-4777-8777-777777777777');

-- 60.
select throws_ok(
  'select code_hash from public.care_link_invites',
  '42501', null, 'selecting code_hash is denied');

-- ---------------------------------------------------------------------------
-- SC-3: a consumed code is invalid for anyone else; same-user replay is exact.
-- ---------------------------------------------------------------------------

-- 61.
select is(
  public.redeem_care_link_code(current_setting('closeout.code_a')),
  '{"status": "invalid"}'::jsonb,
  'a consumed code is invalid for another account');

select pg_temp.set_claims('b2222222-2222-4222-8222-222222222222');

-- 62.
select is(
  (select count(*) from public.care_links
    where elder_id = 'b2222222-2222-4222-8222-222222222222'
      and member_role = 'caregiver'),
  1::bigint, 'the unrelated replay created no new caregiver link for the elder');

select pg_temp.set_claims('b6666666-6666-4666-8666-666666666666');
select set_config(
  'closeout.replay_c',
  public.redeem_care_link_code(current_setting('closeout.code_c'))::text,
  true);

-- 63.
select is(
  (current_setting('closeout.replay_c')::jsonb ->> 'status'), 'active',
  'a same-account replay returns the link status');

-- 64.
select is(
  (current_setting('closeout.replay_c')::jsonb ->> 'link_id'), current_setting('closeout.link_l3'),
  'the same-account replay returns the same link id');

-- ---------------------------------------------------------------------------
-- SC-3: a family member with a live link for the elder cannot create a second
-- one; the second invite stays open and the refusal is an evaluated failure.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('bccccccc-cccc-4ccc-8ccc-cccccccccccc');
select set_config('closeout.code_g0', public.create_elder_link_invite(), true);

select pg_temp.set_claims('beeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
select set_config(
  'closeout.link_l5',
  coalesce(public.redeem_care_link_code(current_setting('closeout.code_g0')) ->> 'link_id', ''),
  true);

-- 65.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l5')::uuid),
  'active', 'the fifth caregiver links the seventh elder');

select pg_temp.set_claims('bccccccc-cccc-4ccc-8ccc-cccccccccccc');
select set_config('closeout.code_g1', public.invite_family_member(), true);

select pg_temp.set_claims('bddddddd-dddd-4ddd-8ddd-dddddddddddd');
select set_config(
  'closeout.link_l6',
  coalesce(public.redeem_care_link_code(current_setting('closeout.code_g1')) ->> 'link_id', ''),
  true);

-- 66.
select is(
  (select status from public.care_links where id = current_setting('closeout.link_l6')::uuid),
  'invited', 'the family member redeems the first invite');

select pg_temp.set_claims('bccccccc-cccc-4ccc-8ccc-cccccccccccc');
select set_config('closeout.code_g2', public.invite_family_member(), true);

select pg_temp.set_claims('bddddddd-dddd-4ddd-8ddd-dddddddddddd');

-- 67.
select is(
  public.redeem_care_link_code(current_setting('closeout.code_g2')),
  '{"status": "invalid"}'::jsonb,
  'a second live family link is refused');

select pg_temp.set_claims('bccccccc-cccc-4ccc-8ccc-cccccccccccc');

-- 68.
select is(
  (select count(*) from public.care_link_invites
    where created_by = 'bccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and grants_member_role = 'family_member'
      and consumed_at is null),
  1::bigint, 'the refused second invite stays open');

-- The elder sees the family link; its manager does not (RLS).
select pg_temp.set_claims('beeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

-- 69.
select is(
  (select count(*) from public.care_links
    where elder_id = 'beeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      and member_id = 'bddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and status <> 'revoked'),
  1::bigint, 'only one live link exists for the pair');

select pg_temp.set_claims('bddddddd-dddd-4ddd-8ddd-dddddddddddd');

-- 70.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'bddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and action = 'care_link_invite.redeem_failed'),
  1::bigint, 'the refusal is audited as an evaluated failure');

-- ---------------------------------------------------------------------------
-- Review fixes (2026-09-27): callers who can never match an invite are not
-- evaluated, failure audit summaries are uniform, and refusals do not extend
-- the cooldown.
-- ---------------------------------------------------------------------------

-- A deactivated account cannot be evaluated.
select pg_temp.set_claims('b8888888-8888-4888-8888-888888888888');

-- 71.
select is(
  public.redeem_care_link_code('000000'), '{"status": "invalid"}'::jsonb,
  'a deactivated account cannot redeem');

-- 72.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'b8888888-8888-4888-8888-888888888888'
      and action = 'care_link_invite.redeem_failed'),
  0::bigint, 'a deactivated account is not audited as a failure');

-- Malformed input is not evaluated or counted.
select pg_temp.set_claims('baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- 73.
select is(
  public.redeem_care_link_code('12345'), '{"status": "invalid"}'::jsonb,
  'a short code is uniformly invalid');

-- 74.
select is(
  public.redeem_care_link_code(null), '{"status": "invalid"}'::jsonb,
  'a null code is uniformly invalid');

-- 75.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and action = 'care_link_invite.redeem_failed'),
  0::bigint, 'malformed codes are not counted as failures');

-- A caregiver can never match an invite.
select pg_temp.set_claims('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- 76.
select is(
  public.redeem_care_link_code('000000'), '{"status": "invalid"}'::jsonb,
  'a caregiver cannot redeem');

-- 77.
select is(
  (select count(*) from public.audit_events
    where actor_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and action = 'care_link_invite.redeem_failed'),
  0::bigint, 'a caregiver attempt is not counted as a guess');

-- Every failure class records the same summary for its actor.
select pg_temp.set_claims('b7777777-7777-4777-8777-777777777777');

-- 78.
select is(
  (select count(distinct after_summary) from public.audit_events
    where actor_id = 'b7777777-7777-4777-8777-777777777777'
      and action = 'care_link_invite.redeem_failed'),
  1::bigint, 'failure audit summaries are uniform');

-- Refusals do not extend the cooldown.
select pg_temp.set_claims('b4444444-4444-4444-8444-444444444444');
select set_config(
  'closeout.rl_a', public.redeem_care_link_code('000000')::text, true);
select set_config(
  'closeout.rl_b', public.redeem_care_link_code('000000')::text, true);

-- 79.
select is(
  (current_setting('closeout.rl_a')::jsonb ->> 'status'), 'rate_limited',
  'the account is still rate limited');

-- 80.
select ok(
  (current_setting('closeout.rl_b')::jsonb ->> 'retry_after_seconds')::int
    <= (current_setting('closeout.rl_a')::jsonb ->> 'retry_after_seconds')::int,
  'repeated refusals do not extend the cooldown');

select * from finish();
rollback;
