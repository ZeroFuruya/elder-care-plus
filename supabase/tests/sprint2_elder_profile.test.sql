-- Sprint 2 invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-2.md as database tests: RLS reads scoped to the care
-- circle, direct writes denied, RPC authorisation, input validation, the
-- exactly-one-primary invariant, the verification lifecycle, the two-phase
-- reorder, the audit rules, IDOR, completeness and the no-cascade FKs.
--
-- Values are carried between statements with set_config/current_setting rather
-- than psql variables, so the file does not depend on the psql client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(60);

-- JWT claims helper (same as Sprint 1): p_pw_age_seconds null omits amr entirely.
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
-- Fixtures. Inserting an auth user creates the profile via the trigger.
--   c1 1111… caregiver A (manages e1)   e1 2222… elder A
--   f1 3333… family F (views e1)        u1 5555… unrelated elder
--   c2 6666… caregiver B (manages e2)   e2 7777… elder B
--   e3 8888… elder with no elder_profiles row (FK test)
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
   '{"role":"elder","full_name":"Elder Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888',
   'authenticated', 'authenticated', 'e3@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Elder Three"}', now(), now());

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The care circle: c1 manages e1; f1 views e1 once the elder consents; c2
-- manages e2. Setup writes go through the Sprint 1 RPCs only.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s2.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's2.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s2.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s2.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's2.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s2.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s2.link_f')::uuid);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s2.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's2.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s2.code_b')) ->> 'link_id', ''),
  true);

-- ---------------------------------------------------------------------------
-- Data under test. c1 completes e1's profile and four numbers; c2 completes a
-- minimal e2 (one doctor number), used for IDOR and completeness.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select public.upsert_elder_profile(
  '22222222-2222-2222-2222-222222222222', '1948-03-02', 'O+',
  '12 Test Street', null, 'Singapore', null, '123456', 'SG',
  'Penicillin', 'Hypertension', 'Call family before any change',
  'Dr. Test', '+65 6123 4567');

select set_config('s2.n1', public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_category => 'emergency_service', p_label => 'Ambulance',
  p_phone => '995', p_priority => 0)::text, true);
select set_config('s2.n2', public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_category => 'primary_caregiver', p_label => 'Caregiver One',
  p_phone => '+65 8123 4567', p_priority => 1)::text, true);
select set_config('s2.n3', public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_category => 'doctor', p_label => 'Dr. Test',
  p_phone => '+65 6123 4567', p_priority => 2)::text, true);
select set_config('s2.n4', public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_category => 'pharmacy', p_label => 'Night Pharmacy',
  p_phone => '+65 6123 0000', p_priority => 3)::text, true);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select public.upsert_elder_profile(
  '77777777-7777-7777-7777-777777777777', null, 'unknown',
  null, null, null, null, null, null, null, null, null, null, null);
select set_config('s2.nb1', public.upsert_emergency_number(
  p_elder_id => '77777777-7777-7777-7777-777777777777',
  p_category => 'doctor', p_label => 'Dr. B',
  p_phone => '+65 6000 0000', p_priority => 0)::text, true);

-- ===========================================================================
-- 1-8. RLS reads are scoped to the care circle.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 1.
select is(
  (select count(*) from public.elder_profiles), 1::bigint,
  'the manager reads one elder profile');
-- 2.
select is(
  (select count(*) from public.emergency_numbers), 4::bigint,
  'the manager reads the four emergency numbers');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');

-- 3.
select is(
  (select count(*) from public.elder_profiles), 1::bigint,
  'the elder reads their own profile');
-- 4.
select is(
  (select count(*) from public.emergency_numbers), 4::bigint,
  'the elder reads the four emergency numbers');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');

-- 5.
select is(
  (select count(*) from public.elder_profiles), 1::bigint,
  'an active family member reads the elder profile');
-- 6.
select is(
  (select count(*) from public.emergency_numbers), 4::bigint,
  'an active family member reads the emergency numbers');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');

-- 7.
select is(
  (select count(*) from public.elder_profiles), 0::bigint,
  'an unrelated account reads no elder profile');
-- 8.
select is(
  (select count(*) from public.emergency_numbers), 0::bigint,
  'an unrelated account reads no emergency numbers');

-- ===========================================================================
-- 9-14. Direct writes are denied for authenticated; the RPCs are the only path.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 9.
select throws_ok(
  $$ insert into public.elder_profiles (elder_id)
       values ('22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'a direct insert into elder_profiles is denied');
-- 10.
select throws_ok(
  $$ update public.elder_profiles set blood_type = 'A+' $$,
  '42501', null, 'a direct update to elder_profiles is denied');
-- 11.
select throws_ok(
  $$ delete from public.elder_profiles $$,
  '42501', null, 'a direct delete from elder_profiles is denied');
-- 12.
select throws_ok(
  $$ insert into public.emergency_numbers (elder_id, category, label, phone, priority)
       values ('22222222-2222-2222-2222-222222222222', 'doctor', 'X', '12345', 9) $$,
  '42501', null, 'a direct insert into emergency_numbers is denied');
-- 13.
select throws_ok(
  $$ update public.emergency_numbers set label = 'X' $$,
  '42501', null, 'a direct update to emergency_numbers is denied');
-- 14.
select throws_ok(
  $$ delete from public.emergency_numbers $$,
  '42501', null, 'a direct delete from emergency_numbers is denied');

-- ===========================================================================
-- 15-19. RPC authorisation: only the linked manager may write.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');

-- 15.
select throws_ok(
  $$ select public.upsert_elder_profile(
       '22222222-2222-2222-2222-222222222222', null, 'A+',
       null, null, null, null, null, null, null, null, null, null, null) $$,
  '42501', 'only the linked manager can edit this profile',
  'the elder cannot edit their own profile');
-- 16.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'doctor', 'X', '12345', 9) $$,
  '42501', 'only the linked manager can edit emergency numbers',
  'the elder cannot add an emergency number');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');

-- 17.
select throws_ok(
  $$ select public.set_emergency_number_verified(current_setting('s2.n1')::uuid) $$,
  '42501', null, 'a family member cannot verify a number');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');

-- 18.
select throws_ok(
  $$ select public.reorder_emergency_numbers(
       '22222222-2222-2222-2222-222222222222',
       array[current_setting('s2.n1')::uuid]) $$,
  '42501', null, 'an unrelated account cannot reorder numbers');
-- 19.
select throws_ok(
  $$ select public.deactivate_emergency_number(current_setting('s2.n1')::uuid) $$,
  '42501', null, 'an unrelated account cannot deactivate a number');

-- ===========================================================================
-- 20-24. Input validation on upsert_emergency_number.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 20.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'alternate_family', '', '12345', 9) $$,
  '23514', 'a label is required', 'an empty label is rejected');
-- 21.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'alternate_family', 'Sister', '', 9) $$,
  '23514', 'a valid phone number is required', 'an empty phone is rejected');
-- 22.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'alternate_family', 'Sister', '12345', null) $$,
  '23514', 'a non-negative priority is required', 'a missing priority is rejected');
-- 23.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'alternate_family', '   ', '12345', 9) $$,
  '23514', 'a label is required', 'a whitespace-only label is rejected');
-- 24.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'not-a-category', 'X', '12345', 9) $$,
  '23514', 'invalid emergency number category', 'an unknown category is rejected');

-- ===========================================================================
-- 25-31. Primary, category and priority invariants.
-- ===========================================================================

-- 25.
select is(
  (select id from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active and is_primary),
  current_setting('s2.n1')::uuid,
  'the first active number becomes the primary automatically');
-- 26.
select is(
  (select count(*) from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active and is_primary),
  1::bigint, 'exactly one active primary exists');

select set_config('s2.n2', public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_id => current_setting('s2.n2')::uuid,
  p_category => 'primary_caregiver', p_label => 'Caregiver One',
  p_phone => '+65 8123 4567', p_priority => 1, p_is_primary => true)::text, true);

-- 27.
select is(
  (select is_primary from public.emergency_numbers where id = current_setting('s2.n1')::uuid),
  false, 'promoting another number clears the previous primary');
-- 28.
select is(
  (select count(*) from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active and is_primary),
  1::bigint, 'the single-primary invariant survives promotion');

-- 29.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'emergency_service', 'Police', '999', 9) $$,
  '23505', null, 'a second active number in a category is rejected');
-- 30.
select is(
  (select label from public.emergency_numbers where id = current_setting('s2.n1')::uuid),
  'Ambulance', 'the rejected duplicate leaves the existing number untouched');
-- 31.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'alternate_family', 'Sister', '12345', 1) $$,
  '23505', null, 'an active priority collision is rejected');

-- ===========================================================================
-- 32-34. Verification lifecycle.
-- ===========================================================================

select public.set_emergency_number_verified(current_setting('s2.n1')::uuid);

-- 32.
select is(
  (select verified_by from public.emergency_numbers where id = current_setting('s2.n1')::uuid),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'verifying stamps the caregiver as verifier');

select public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_id => current_setting('s2.n1')::uuid,
  p_category => 'emergency_service', p_label => 'Ambulance',
  p_phone => '9951', p_priority => 0);

-- 33.
select is(
  (select verified_at from public.emergency_numbers where id = current_setting('s2.n1')::uuid),
  null::timestamptz, 'editing the phone clears verification');

select public.set_emergency_number_verified(current_setting('s2.n1')::uuid);

-- 34.
select ok(
  (select verified_at is not null from public.emergency_numbers
    where id = current_setting('s2.n1')::uuid),
  're-verifying after an edit sets verified_at again');

-- ===========================================================================
-- 35-38. Deactivation is soft and promotes a survivor.
-- ===========================================================================

select public.deactivate_emergency_number(current_setting('s2.n2')::uuid, 'no longer needed');

-- 35.
select ok(
  (select not is_active from public.emergency_numbers where id = current_setting('s2.n2')::uuid),
  'deactivating keeps the row and clears is_active');
-- 36.
select is(
  (select id from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active and is_primary),
  current_setting('s2.n1')::uuid,
  'deactivating the primary promotes the lowest-priority survivor');

select set_config('s2.n5', public.upsert_emergency_number(
  p_elder_id => '22222222-2222-2222-2222-222222222222',
  p_category => 'primary_caregiver', p_label => 'Caregiver One',
  p_phone => '+65 8123 4567', p_priority => 1)::text, true);

-- 37.
select ok(
  current_setting('s2.n5') <> '',
  'the freed category can be refilled after deactivation');
-- 38.
select is(
  (select count(*) from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active and is_primary),
  1::bigint, 'the single-primary invariant holds after deactivate and refill');

-- ===========================================================================
-- 39-44. Reorder validates the set, then uses the two-phase swap.
-- ===========================================================================

-- 39.
select throws_ok(
  $$ select public.reorder_emergency_numbers(
       '22222222-2222-2222-2222-222222222222',
       array(select id from public.emergency_numbers
              where elder_id = '22222222-2222-2222-2222-222222222222'
                and is_active and id <> current_setting('s2.n1')::uuid)) $$,
  '23514', null, 'reorder rejects an array that omits an active id');
-- 40.
select throws_ok(
  $$ select public.reorder_emergency_numbers(
       '22222222-2222-2222-2222-222222222222',
       array[
         current_setting('s2.n1')::uuid,
         current_setting('s2.n1')::uuid,
         current_setting('s2.n2')::uuid,
         current_setting('s2.n3')::uuid]) $$,
  '23514', null, 'reorder rejects a duplicated id');
-- 41.
select throws_ok(
  $$ select public.reorder_emergency_numbers(
       '22222222-2222-2222-2222-222222222222',
       array[
         current_setting('s2.n1')::uuid,
         current_setting('s2.n3')::uuid,
         current_setting('s2.n4')::uuid,
         current_setting('s2.nb1')::uuid]) $$,
  '23514', null, 'reorder rejects a foreign id');

-- 42.
select lives_ok(
  $$ select public.reorder_emergency_numbers(
       '22222222-2222-2222-2222-222222222222',
       array[
         current_setting('s2.n5')::uuid,
         current_setting('s2.n4')::uuid,
         current_setting('s2.n3')::uuid,
         current_setting('s2.n1')::uuid]) $$,
  'a valid reorder (a full reversal) succeeds');
-- 43.
select is(
  (select id from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active
    order by priority limit 1),
  current_setting('s2.n5')::uuid,
  'the reorder applies the first requested position');
-- 44.
select is(
  (select id from public.emergency_numbers
    where elder_id = '22222222-2222-2222-2222-222222222222' and is_active
    order by priority desc limit 1),
  current_setting('s2.n1')::uuid,
  'the reorder applies the last requested position');

-- ===========================================================================
-- 45-49. Audit: one row per state change, none for a no-op.
-- ===========================================================================

select set_config('s2.audit_profile', (
  select count(*)::text from public.audit_events
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and action = 'elder_profile.updated'), true);

select public.upsert_elder_profile(
  '22222222-2222-2222-2222-222222222222', '1948-03-02', 'O+',
  '12 Test Street', null, 'Singapore', null, '123456', 'SG',
  'Penicillin', 'Hypertension, gout', 'Call family before any change',
  'Dr. Test', '+65 6123 4567');

-- 45.
select is(
  (select count(*) from public.audit_events
    where elder_id = '22222222-2222-2222-2222-222222222222'
      and action = 'elder_profile.updated'),
  current_setting('s2.audit_profile')::bigint + 1,
  'a changing profile upsert writes exactly one audit row');

select set_config('s2.audit_profile', (
  select count(*)::text from public.audit_events
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and action = 'elder_profile.updated'), true);

select public.upsert_elder_profile(
  '22222222-2222-2222-2222-222222222222', '1948-03-02', 'O+',
  '12 Test Street', null, 'Singapore', null, '123456', 'SG',
  'Penicillin', 'Hypertension, gout', 'Call family before any change',
  'Dr. Test', '+65 6123 4567');

-- 46.
select is(
  (select count(*) from public.audit_events
    where elder_id = '22222222-2222-2222-2222-222222222222'
      and action = 'elder_profile.updated'),
  current_setting('s2.audit_profile')::bigint,
  'a no-op profile upsert writes no audit row');

select public.set_emergency_number_verified(current_setting('s2.n3')::uuid);

-- 47.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s2.n3')::uuid
      and action = 'emergency_number.verified'),
  1::bigint, 'verifying writes exactly one audit row');
-- 48.
select is(
  (select elder_id from public.audit_events
    where target_id = current_setting('s2.n3')::uuid
      and action = 'emergency_number.verified'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the audit row carries the resolved elder id');

select public.set_emergency_number_verified(current_setting('s2.n3')::uuid);

-- 49.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s2.n3')::uuid
      and action = 'emergency_number.verified'),
  1::bigint, 're-verifying an already verified number writes no audit row');

-- ===========================================================================
-- 50-53. IDOR: a manager of one elder cannot touch another's numbers.
-- ===========================================================================

-- 50.
select throws_ok(
  $$ select public.set_emergency_number_verified(current_setting('s2.nb1')::uuid) $$,
  '42501', null, 'a manager of another elder cannot verify a foreign number');
-- 51.
select throws_ok(
  $$ select public.deactivate_emergency_number(current_setting('s2.nb1')::uuid) $$,
  '42501', null, 'a manager of another elder cannot deactivate a foreign number');
-- 52.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '77777777-7777-7777-7777-777777777777', 'pharmacy', 'X', '12345', 5) $$,
  '42501', null, 'a manager of another elder cannot add a number for them');
-- 53.
select is(
  (select count(*) from public.audit_events
    where elder_id = '77777777-7777-7777-7777-777777777777'
      and actor_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'the rejected IDOR attempts write no audit row');

-- ===========================================================================
-- 54-60. Completeness, no hard delete (restrictive FKs) and privileges.
-- Read as the superuser so RLS does not hide the rows under test.
-- ===========================================================================

reset role;

-- 54.
select is(
  (select exists (
     select 1 from public.emergency_numbers
     where elder_id = '22222222-2222-2222-2222-222222222222'
       and is_active and category = 'emergency_service' and verified_at is not null)),
  true, 'the emergency set is complete once the service number is verified');
-- 55.
select is(
  (select exists (
     select 1 from public.emergency_numbers
     where elder_id = '77777777-7777-7777-7777-777777777777'
       and is_active and category = 'emergency_service' and verified_at is not null)),
  false, 'an elder without a verified service number is incomplete');

-- 56.
select is(
  (select confdeltype::text from pg_constraint
    where conname = 'emergency_numbers_elder_id_fkey'),
  'r', 'emergency_numbers.elder_id is ON DELETE RESTRICT');
-- 57.
select is(
  (select confdeltype::text from pg_constraint
    where conname = 'elder_profiles_elder_id_fkey'),
  'r', 'elder_profiles.elder_id is ON DELETE RESTRICT');
-- 58.
select throws_ok(
  $$ insert into public.emergency_numbers (elder_id, category, label, phone, priority)
       values ('88888888-8888-8888-8888-888888888888', 'doctor', 'X', '12345', 0) $$,
  '23503', null, 'a number cannot exist without an elder profile');
-- 59.
select ok(
  has_function_privilege('authenticated',
    'public.upsert_elder_profile(uuid,date,text,text,text,text,text,text,text,text,text,text,text,text)',
    'execute')
  and has_function_privilege('authenticated',
    'public.upsert_emergency_number(uuid,text,text,text,integer,boolean,uuid)', 'execute')
  and has_function_privilege('authenticated',
    'public.reorder_emergency_numbers(uuid,uuid[])', 'execute')
  and has_function_privilege('authenticated',
    'public.set_emergency_number_verified(uuid)', 'execute')
  and has_function_privilege('authenticated',
    'public.deactivate_emergency_number(uuid,text)', 'execute'),
  'authenticated may execute all five public RPCs');
-- 60.
select ok(
  not has_function_privilege('authenticated',
    'public.ensure_single_primary(uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.upsert_elder_profile(uuid,date,text,text,text,text,text,text,text,text,text,text,text,text)',
    'execute'),
  'the internal helper and anon cannot execute the write RPCs');

select * from finish();
rollback;
