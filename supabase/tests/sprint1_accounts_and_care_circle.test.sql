-- Sprint 1 invariants (pgTAP). Run with: npx supabase test db
--
-- These are the acceptance criteria in docs/specs/sprint-1.md expressed as
-- database tests: the signup trigger, role immutability, the one-manager rules,
-- idempotent redemption, elder consent, default-deny RLS and the append-only
-- audit trail.
--
-- Values are carried between statements with set_config/current_setting rather
-- than psql variables, so the file does not depend on the psql client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(26);

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

select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'caregiver', 'signup trigger creates a caregiver profile');

select is(
  (select role from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'elder', 'signup trigger creates an elder profile');

select is(
  (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'family_member', 'signup trigger creates a family_member profile');

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

select throws_ok(
  $$ update public.profiles set role = 'elder'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', 'profiles.role is immutable', 'role cannot be changed after sign-up');

-- ---------------------------------------------------------------------------
-- Caregiver invites an elder; the elder redeems. The redemption is the consent.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select set_config('sprint1.code', public.create_elder_link_invite(), true);

select matches(
  current_setting('sprint1.code'), '^[0-9]{6}$'::text,
  'a caregiver gets a six-digit code');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select set_config(
  'sprint1.link_id',
  public.redeem_care_link_code(current_setting('sprint1.code'))::text,
  true);

select isnt(
  current_setting('sprint1.link_id'), ''::text,
  'the elder redeems the code and gets a link');
select is(
  (select status from public.care_links where id = current_setting('sprint1.link_id')::uuid),
  'active', 'an elder link activates on redemption');
select is(
  (select count(*) from public.care_links
    where elder_id = '22222222-2222-2222-2222-222222222222' and status = 'active'),
  1::bigint, 'exactly one active link exists for the elder');

select set_config(
  'sprint1.replay_id',
  public.redeem_care_link_code(current_setting('sprint1.code'))::text,
  true);
select is(
  current_setting('sprint1.replay_id'), current_setting('sprint1.link_id'),
  'a replayed redemption returns the same link');
select is(
  (select count(*) from public.care_links where elder_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint, 'a replayed redemption creates no second link');

-- An unrelated account cannot redeem, and a wrong code burns an attempt.
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';
select set_config(
  'sprint1.bad', coalesce(public.redeem_care_link_code('000000')::text, ''), true);
select is(current_setting('sprint1.bad'), ''::text, 'a wrong code returns null');

-- ---------------------------------------------------------------------------
-- A second caregiver, so the attempt cap can be observed on an open invite.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';
select set_config('sprint1.code2', public.create_elder_link_invite(), true);

set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777"}';
select set_config(
  'sprint1.bad2', coalesce(public.redeem_care_link_code('000000')::text, ''), true);

-- RLS hides the invite from the redeemer, so check the attempt as its owner.
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';
select is(
  (select max(attempts) from public.care_link_invites
    where created_by = '66666666-6666-6666-6666-666666666666'),
  1, 'a wrong code burns an attempt on the open invite');

set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777"}';
select set_config(
  'sprint1.link2',
  public.redeem_care_link_code(current_setting('sprint1.code2'))::text,
  true);
select is(
  (select status from public.care_links where id = current_setting('sprint1.link2')::uuid),
  'active', 'the second elder link activates');

-- ---------------------------------------------------------------------------
-- Family member joins: invited until the elder consents.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
select set_config('sprint1.code3', public.invite_family_member(), true);

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';
select set_config(
  'sprint1.family_link',
  public.redeem_care_link_code(current_setting('sprint1.code3'))::text,
  true);

select is(
  (select status from public.care_links where id = current_setting('sprint1.family_link')::uuid),
  'invited', 'a family link starts as invited, not active');
select ok(
  (select elder_consent_at is null from public.care_links
    where id = current_setting('sprint1.family_link')::uuid),
  'the family link has no elder consent yet');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
select public.consent_to_care_link(current_setting('sprint1.family_link')::uuid);
select is(
  (select status from public.care_links where id = current_setting('sprint1.family_link')::uuid),
  'active', 'the elder consent activates the family link');
select lives_ok(
  $$ select public.consent_to_care_link(
       (select id from public.care_links
         where member_id = '33333333-3333-3333-3333-333333333333'
           and member_role = 'family_member')) $$,
  'consenting twice is harmless');

-- ---------------------------------------------------------------------------
-- Default-deny RLS and no DELETE.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';
select is(
  (select count(*) from public.care_links), 0::bigint,
  'an unrelated account reads zero care links');
select is(
  (select count(*) from public.profiles), 1::bigint,
  'an unrelated account reads only its own profile');

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*) from public.profiles), 3::bigint,
  'a family member reads itself, the elder and the manager');
select throws_ok(
  $$ delete from public.care_links $$,
  '42501', null, 'authenticated cannot delete care links');

-- ---------------------------------------------------------------------------
-- Deactivation is a soft delete, and it revokes live links.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777"}';
select public.deactivate_account('test teardown');
select is(
  (select status from public.care_links where id = current_setting('sprint1.link2')::uuid),
  'revoked', 'deactivating an account revokes its links');
select ok(
  (select deactivated_at is not null from public.profiles
    where id = '77777777-7777-7777-7777-777777777777'),
  'deactivating an account stamps deactivated_at');

-- ---------------------------------------------------------------------------
-- The audit trail is append-only.
-- ---------------------------------------------------------------------------

reset role;
select throws_ok(
  $$ update public.audit_events set action = 'tampered' $$,
  '42501', 'audit_events is append-only (UPDATE is not permitted)',
  'the audit trail rejects updates');
select throws_ok(
  $$ delete from public.audit_events $$,
  '42501', 'audit_events is append-only (DELETE is not permitted)',
  'the audit trail rejects deletes');

select * from finish();
rollback;
