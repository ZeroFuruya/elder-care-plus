-- Sprint 1 invariants (pgTAP). Run with: npx supabase test db
--
-- These are the acceptance criteria in docs/specs/sprint-1.md expressed as
-- database tests: the signup trigger, role immutability, the one-manager rules,
-- idempotent redemption, elder consent, default-deny RLS and the append-only
-- audit trail.
--
-- The security-closeout addendum (frozen 2026-09-27) changed two things this
-- file used to encode: a wrong code no longer burns an attempt on someone
-- else's invite (the invite-level counter is gone), and the redemption call
-- returns a jsonb result instead of a uuid. Re-authentication, redemption
-- abuse and the closeout assertions live in sprint1_security_closeout.test.sql.
--
-- Values are carried between statements with set_config/current_setting rather
-- than psql variables, so the file does not depend on the psql client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(38);

-- JWT claims helper: p_pw_age_seconds null omits amr entirely; otherwise it is
-- a password entry that many seconds old. Timestamps come from the clock.
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
-- Fixtures. Inserting an auth user must create the profile via the trigger.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'c1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Caregiver One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'e1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Elder One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'f1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"family_member","full_name":"Family One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'u1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Unrelated One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'c2@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Caregiver Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'e2@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Elder Two"}', now(), now());

-- 1.
select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'caregiver', 'signup trigger creates a caregiver profile');

-- 2.
select is(
  (select role from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'elder', 'signup trigger creates an elder profile');

-- 3.
select is(
  (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'family_member', 'signup trigger creates a family_member profile');

-- 4.
select throws_ok(
  $$ insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888',
       'authenticated', 'authenticated', 'bad@example.test',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"role":"admin","full_name":"Bad Actor"}', now(), now()) $$,
  '23514', 'invalid sign-up role: admin', 'an unknown sign-up role is rejected');

-- 5.
select is(
  (select count(*) from auth.users where id = '88888888-8888-8888-8888-888888888888'),
  0::bigint, 'the rejected sign-up creates no auth user');

-- 6.
select is(
  (select count(*) from public.profiles where id = '88888888-8888-8888-8888-888888888888'),
  0::bigint, 'the rejected sign-up creates no profile');

-- 7.
select throws_ok(
  $$ insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999',
       'authenticated', 'authenticated', 'norole@example.test',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"full_name":"No Role"}', now(), now()) $$,
  '23514', 'sign-up role is required', 'a sign-up with no role is rejected');

-- 8.
select is(
  (select count(*) from auth.users where id = '99999999-9999-9999-9999-999999999999'),
  0::bigint, 'the missing-role sign-up creates no auth user');

-- 9.
select is(
  (select count(*) from public.profiles where id = '99999999-9999-9999-9999-999999999999'),
  0::bigint, 'the missing-role sign-up creates no profile');

-- 10.
select throws_ok(
  $$ insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111',
       'authenticated', 'authenticated', 'blank@example.test',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"role":"","full_name":"Blank"}', now(), now()) $$,
  '23514', 'sign-up role is required', 'a blank sign-up role is rejected');

-- 11.
select is(
  (select count(*) from auth.users where id = 'a1111111-1111-1111-1111-111111111111'),
  0::bigint, 'the blank-role sign-up creates no auth user');

-- 12.
select is(
  (select count(*) from public.profiles where id = 'a1111111-1111-1111-1111-111111111111'),
  0::bigint, 'the blank-role sign-up creates no profile');

-- 13.
select throws_ok(
  $$ insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222',
       'authenticated', 'authenticated', 'padded@example.test',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"role":" caregiver ","full_name":"Padded"}', now(), now()) $$,
  '23514', null, 'a role with padding is rejected, not trimmed');

-- 14.
select is(
  (select count(*) from auth.users where id = 'a2222222-2222-2222-2222-222222222222'),
  0::bigint, 'the padded-role sign-up creates no auth user');

-- 15.
select is(
  (select count(*) from public.profiles where id = 'a2222222-2222-2222-2222-222222222222'),
  0::bigint, 'the padded-role sign-up creates no profile');

-- 16.
select throws_ok(
  $$ update public.profiles set role = 'elder'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', 'profiles.role is immutable', 'role cannot be changed after sign-up');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Caregiver invites an elder; the elder redeems. The redemption is the consent.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('sprint1.code', public.create_elder_link_invite(), true);

-- 17.
select matches(
  current_setting('sprint1.code'), '^[0-9]{6}$'::text,
  'a caregiver gets a six-digit code');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  'sprint1.link_id',
  coalesce(public.redeem_care_link_code(current_setting('sprint1.code')) ->> 'link_id', ''),
  true);

-- 18.
select isnt(
  current_setting('sprint1.link_id'), ''::text,
  'the elder redeems the code and gets a link');

-- 19.
select is(
  (select status from public.care_links where id = current_setting('sprint1.link_id')::uuid),
  'active', 'an elder link activates on redemption');

-- 20.
select is(
  (select count(*) from public.care_links
    where elder_id = '22222222-2222-2222-2222-222222222222' and status = 'active'),
  1::bigint, 'exactly one active link exists for the elder');

select set_config(
  'sprint1.replay_id',
  coalesce(public.redeem_care_link_code(current_setting('sprint1.code')) ->> 'link_id', ''),
  true);

-- 21.
select is(
  current_setting('sprint1.replay_id'), current_setting('sprint1.link_id'),
  'a replayed redemption returns the same link');

-- 22.
select is(
  (select count(*) from public.care_links where elder_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint, 'a replayed redemption creates no second link');

-- A wrong code is uniformly invalid and must not touch anyone's invite.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');

-- 23.
select is(
  public.redeem_care_link_code('000000'), '{"status": "invalid"}'::jsonb,
  'a wrong code returns the uniform invalid result');

-- A second caregiver, so a wrong guess by another account can be observed.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('sprint1.code2', public.create_elder_link_invite(), true);

select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');

-- 24.
select is(
  public.redeem_care_link_code('000000'), '{"status": "invalid"}'::jsonb,
  'another account guessing wrongly also gets invalid');

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');

-- 25.
select is(
  (select consumed_at is null and expires_at > now() from public.care_link_invites
    where created_by = '66666666-6666-6666-6666-666666666666'),
  true, 'a wrong guess leaves the open invite untouched');

select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  'sprint1.link2',
  coalesce(public.redeem_care_link_code(current_setting('sprint1.code2')) ->> 'link_id', ''),
  true);

-- 26.
select is(
  (select status from public.care_links where id = current_setting('sprint1.link2')::uuid),
  'active', 'the second elder link activates');

-- ---------------------------------------------------------------------------
-- Family member joins: invited until the elder consents.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('sprint1.code3', public.invite_family_member(), true);

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  'sprint1.family_link',
  coalesce(public.redeem_care_link_code(current_setting('sprint1.code3')) ->> 'link_id', ''),
  true);

-- 27.
select is(
  (select status from public.care_links where id = current_setting('sprint1.family_link')::uuid),
  'invited', 'a family link starts as invited, not active');

-- 28.
select ok(
  (select elder_consent_at is null from public.care_links
    where id = current_setting('sprint1.family_link')::uuid),
  'the family link has no elder consent yet');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('sprint1.family_link')::uuid);

-- 29.
select is(
  (select status from public.care_links where id = current_setting('sprint1.family_link')::uuid),
  'active', 'the elder consent activates the family link');

-- 30.
select lives_ok(
  $$ select public.consent_to_care_link(
       (select id from public.care_links
         where member_id = '33333333-3333-3333-3333-333333333333'
           and member_role = 'family_member')) $$,
  'consenting twice is harmless');

-- ---------------------------------------------------------------------------
-- Default-deny RLS and no DELETE.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');

-- 31.
select is(
  (select count(*) from public.care_links), 0::bigint,
  'an unrelated account reads zero care links');

-- 32.
select is(
  (select count(*) from public.profiles), 1::bigint,
  'an unrelated account reads only its own profile');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');

-- 33.
select is(
  (select count(*) from public.profiles), 3::bigint,
  'a family member reads itself, the elder and the manager');

-- 34.
select throws_ok(
  $$ delete from public.care_links $$,
  '42501', null, 'authenticated cannot delete care links');

-- ---------------------------------------------------------------------------
-- Deactivation is a soft delete, and it revokes live links.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('77777777-7777-7777-7777-777777777777', 0);
select public.deactivate_account('test teardown');

-- 35.
select is(
  (select status from public.care_links where id = current_setting('sprint1.link2')::uuid),
  'revoked', 'deactivating an account revokes its links');

-- 36.
select ok(
  (select deactivated_at is not null from public.profiles
    where id = '77777777-7777-7777-7777-777777777777'),
  'deactivating an account stamps deactivated_at');

-- ---------------------------------------------------------------------------
-- The audit trail is append-only.
-- ---------------------------------------------------------------------------

reset role;

-- 37.
select throws_ok(
  $$ update public.audit_events set action = 'tampered' $$,
  '42501', 'audit_events is append-only (UPDATE is not permitted)',
  'the audit trail rejects updates');

-- 38.
select throws_ok(
  $$ delete from public.audit_events $$,
  '42501', 'audit_events is append-only (DELETE is not permitted)',
  'the audit trail rejects deletes');

select * from finish();
rollback;
