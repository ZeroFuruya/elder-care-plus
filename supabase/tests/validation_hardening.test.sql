-- Validation-hardening invariants (pgTAP). Run with: npx supabase test db
--
-- The owner asked (2026-09-30) for the logical constraints to be enforced for
-- real. These assertions prove the server rejects what the client now rejects:
-- an implausible or under-18 birth date, a malformed doctor phone, and every
-- value the `numeric(10,3)` and length ceilings exist to stop.
--
-- Values are carried between statements with set_config/current_setting rather
-- than psql variables, so the file does not depend on the psql client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(13);

-- JWT claims helper (same as Sprints 1-4).
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

-- The 14 arguments of `upsert_elder_profile` without named-notation noise.
create function pg_temp.set_elder_profile(p_dob date, p_doctor_phone text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.upsert_elder_profile(
    p_elder_id => '22222222-2222-2222-2222-222222222222',
    p_date_of_birth => p_dob,
    p_blood_type => 'O+',
    p_address_line1 => null, p_address_line2 => null, p_city => null,
    p_region => null, p_postal_code => null, p_country_code => null,
    p_allergies => null, p_conditions => null, p_care_instructions => null,
    p_doctor_name => null, p_doctor_phone => p_doctor_phone);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: c1 manages e1. Inserting an auth user creates the profile.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'vh-c1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"caregiver","full_name":"Caregiver One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'vh-e1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Elder One"}', now(), now());

set local role authenticated;

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('vh.code', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  'vh.link',
  coalesce(public.redeem_care_link_code(current_setting('vh.code')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- ===========================================================================
-- 1-5. Birth date and doctor phone on the elder profile.
-- ===========================================================================

-- 1.
select lives_ok(
  $$ select pg_temp.set_elder_profile(date '1950-01-01', null) $$,
  'a plausible adult birth date is accepted');

-- 2.
select throws_ok(
  $$ select pg_temp.set_elder_profile((current_date + 1)::date, null) $$,
  '23514', 'a birth date cannot be in the future', 'a future birth date is rejected');

-- 3.
select throws_ok(
  $$ select pg_temp.set_elder_profile(date '1800-01-01', null) $$,
  '23514', 'a birth date cannot be before 1900', 'a birth date before 1900 is rejected');

-- 4.
select throws_ok(
  $$ select pg_temp.set_elder_profile((current_date - interval '1 year')::date, null) $$,
  '23514', 'the older adult must be at least 18 years old', 'an under-18 birth date is rejected');

-- 5.
select throws_ok(
  $$ select pg_temp.set_elder_profile(date '1950-01-01', 'not a phone') $$,
  '23514', 'a valid phone number is required', 'a malformed doctor phone is rejected');

-- ===========================================================================
-- 6-10. Medication and batch quantity ceilings.
-- ===========================================================================

-- 6.
select set_config('vh.med', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Amlodipine', '5 mg', 'tablet', 1, 'tablet',
  'Take one each morning', date '2026-10-01', null)::text, true);
select isnt(current_setting('vh.med'), '', 'a valid medicine is created');

-- 7.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'Too much', '5 mg', 'tablet', 10000000,
       'tablet', 'Take one', date '2026-10-01', null) $$,
  '23514', 'dose quantity is too large', 'an oversized dose quantity is rejected');

-- 8.
select set_config('vh.batch', public.create_batch(
  current_setting('vh.med')::uuid, 30, 'tablet', 'LOT-1',
  current_date + 365, 7, null, true)::text, true);
select isnt(current_setting('vh.batch'), '', 'a valid batch is created');

-- 9.
select throws_ok(
  $$ select public.create_batch(
       current_setting('vh.med')::uuid, 10000000, 'tablet', null,
       current_date + 365, null, null, false) $$,
  '23514', 'batch quantity is too large', 'an oversized batch quantity is rejected');

-- 10.
select throws_ok(
  $$ select public.create_batch(
       current_setting('vh.med')::uuid, 10, 'tablet', null,
       current_date + 365, 10000000, null, false) $$,
  '23514', 'the low-stock threshold is too large', 'an oversized low-stock threshold is rejected');

-- ===========================================================================
-- 11-13. Emergency-contact label and priority ceilings.
-- ===========================================================================

-- 11.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'doctor', repeat('x', 81), '12345', 1) $$,
  '23514', null, 'an over-long contact label is rejected');

-- 12.
select throws_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'doctor', 'Dr X', '12345', 1000) $$,
  '23514', null, 'an over-range contact priority is rejected');

-- 13.
select lives_ok(
  $$ select public.upsert_emergency_number(
       '22222222-2222-2222-2222-222222222222', 'doctor', 'Dr X', '12345', 1) $$,
  'a valid emergency contact is accepted');

select * from finish();
rollback;
