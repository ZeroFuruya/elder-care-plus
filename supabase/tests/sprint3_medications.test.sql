-- Sprint 3 invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-3.md as database tests: RLS reads scoped to the care
-- circle, direct writes denied, RPC authorisation and cross-elder IDOR, input
-- validation on every setup path, the draft -> active rule, the slot and
-- active-batch invariants, expired-batch safety, soft deactivation, and the
-- exactly-one-audit-row-per-state-change contract.
--
-- Acceptance criterion 10 (two concurrent `set_active_batch` calls) cannot be
-- proven in a single-session pgTAP harness; as in Sprint 2 the invariant is
-- proven across serialized calls and the serialising advisory lock is asserted
-- to be present in the function body.
--
-- Acceptance criterion 8's "a schedule edit cancels future not-yet-due
-- occurrences without deleting them" is **not tested here**: `dose_events` is
-- Sprint 4's table and does not exist yet, so there is no occurrence to cancel.
-- See the comment on `update_schedule` in the migration.
--
-- Values are carried between statements with set_config/current_setting rather
-- than psql variables, so the file does not depend on the psql client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(96);

-- JWT claims helper (same as Sprint 1 and 2).
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

set local role authenticated;

-- The care circle. c1 manages e1; f1 views e1 once the elder consents; c2
-- manages e2. These writes go through the Sprint 1 RPCs only.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s3.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's3.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s3.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s3.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's3.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s3.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s3.link_f')::uuid);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s3.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's3.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s3.code_b')) ->> 'link_id', ''),
  true);

-- ---------------------------------------------------------------------------
-- The plan under test, all through the Sprint 3 RPCs.
--   e1: m1 Amlodipine, active, one schedule (Mon/Wed/Fri 08:00), one active batch
--       m2 Metformin, draft,   one schedule (Tue 13:00), one inactive batch
--   e2: m3 Aspirin, active, one schedule (Mon 20:00), one active batch
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

select set_config('s3.m1', public.create_medication(
  '22222222-2222-2222-2222-222222222222',
  'Amlodipine', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-10-01', null)::text, true);
select set_config('s3.m2', public.create_medication(
  '22222222-2222-2222-2222-222222222222',
  'Metformin', '500 mg', 'tablet', 1, 'tablet',
  'Take with breakfast', '2026-10-01', null)::text, true);

select set_config('s3.s1', public.create_schedule(
  current_setting('s3.m1')::uuid, array[1, 3, 5]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s3.s2', public.create_schedule(
  current_setting('s3.m2')::uuid, array[2]::smallint[], '13:00',
  'Asia/Singapore', 30)::text, true);

select public.set_medication_active(current_setting('s3.m1')::uuid, true);

select set_config('s3.b1', public.create_batch(
  current_setting('s3.m1')::uuid, 30, 'tablet', 'LOT-A1', '2027-12-31',
  7, 'Night Pharmacy', true)::text, true);
select set_config('s3.b2', public.create_batch(
  current_setting('s3.m2')::uuid, 20, 'tablet', 'LOT-M1', '2027-06-30',
  5, null, false)::text, true);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s3.m3', public.create_medication(
  '77777777-7777-7777-7777-777777777777',
  'Aspirin', '100 mg', 'tablet', 1, 'tablet',
  'Take after dinner', '2026-10-01', null)::text, true);
select set_config('s3.s3', public.create_schedule(
  current_setting('s3.m3')::uuid, array[1]::smallint[], '20:00',
  'Asia/Singapore', 30)::text, true);
select public.set_medication_active(current_setting('s3.m3')::uuid, true);
select set_config('s3.b3', public.create_batch(
  current_setting('s3.m3')::uuid, 10, 'tablet', null, '2027-06-30',
  null, null, true)::text, true);

-- ===========================================================================
-- 1-12. Criterion 1: RLS reads are scoped to the care circle.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 1.
select is((select count(*) from public.medications), 2::bigint,
  'the manager reads the two medicines');
-- 2.
select is((select count(*) from public.medication_schedules), 2::bigint,
  'the manager reads the two schedules');
-- 3.
select is((select count(*) from public.medicine_batches), 2::bigint,
  'the manager reads the two batches');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');

-- 4.
select is((select count(*) from public.medications), 2::bigint,
  'the elder reads the same two medicines');
-- 5.
select is((select count(*) from public.medication_schedules), 2::bigint,
  'the elder reads the same two schedules');
-- 6.
select is((select count(*) from public.medicine_batches), 2::bigint,
  'the elder reads the same two batches');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');

-- 7.
select is((select count(*) from public.medications), 2::bigint,
  'an active family member reads the two medicines read-only');
-- 8.
select is((select count(*) from public.medication_schedules), 2::bigint,
  'an active family member reads the two schedules');
-- 9.
select is((select count(*) from public.medicine_batches), 2::bigint,
  'an active family member reads the two batches');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');

-- 10.
select is((select count(*) from public.medications), 0::bigint,
  'an unrelated account reads no medicine');
-- 11.
select is((select count(*) from public.medication_schedules), 0::bigint,
  'an unrelated account reads no schedule');
-- 12.
select is((select count(*) from public.medicine_batches), 0::bigint,
  'an unrelated account reads no batch');

-- ===========================================================================
-- 13-21. Criterion 2: direct writes are denied; the RPCs are the only path.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 13.
select throws_ok(
  $$ insert into public.medications (elder_id, name, strength, dose_quantity, dose_unit, instructions, start_date)
       values ('22222222-2222-2222-2222-222222222222', 'X', 'Y', 1, 'tablet', 'Z', '2026-10-01') $$,
  '42501', null, 'a direct insert into medications is denied');
-- 14.
select throws_ok($$ update public.medications set name = 'X' $$,
  '42501', null, 'a direct update to medications is denied');
-- 15.
select throws_ok($$ delete from public.medications $$,
  '42501', null, 'a direct delete from medications is denied');
-- 16.
select throws_ok(
  $$ insert into public.medication_schedules (medication_id, days_of_week, time_of_day, timezone)
       values (current_setting('s3.m1')::uuid, array[1]::smallint[], '09:00', 'UTC') $$,
  '42501', null, 'a direct insert into medication_schedules is denied');
-- 17.
select throws_ok($$ update public.medication_schedules set grace_minutes = 10 $$,
  '42501', null, 'a direct update to medication_schedules is denied');
-- 18.
select throws_ok($$ delete from public.medication_schedules $$,
  '42501', null, 'a direct delete from medication_schedules is denied');
-- 19.
select throws_ok(
  $$ insert into public.medicine_batches (medication_id, quantity, unit, expiry_date)
       values (current_setting('s3.m1')::uuid, 1, 'tablet', '2027-01-01') $$,
  '42501', null, 'a direct insert into medicine_batches is denied');
-- 20.
select throws_ok($$ update public.medicine_batches set quantity = 0 $$,
  '42501', null, 'a direct update to medicine_batches is denied');
-- 21.
select throws_ok($$ delete from public.medicine_batches $$,
  '42501', null, 'a direct delete from medicine_batches is denied');

-- ===========================================================================
-- 22-33. Criterion 3: only the linked manager may write, with no cross-elder IDOR.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');

-- 22.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', 'Y', 'tablet', 1, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '42501', null, 'the elder cannot create a medicine');
-- 23.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m1')::uuid, array[1]::smallint[], '09:00', 'UTC', 30) $$,
  '42501', null, 'the elder cannot add a schedule');
-- 24.
select throws_ok(
  $$ select public.create_batch(
       current_setting('s3.m1')::uuid, 1, 'tablet', null, '2027-01-01', null, null, false) $$,
  '42501', null, 'the elder cannot add a batch');
-- 25.
select throws_ok(
  $$ select public.set_medication_active(current_setting('s3.m2')::uuid, true) $$,
  '42501', null, 'the elder cannot activate a medicine');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');

-- 26.
select throws_ok(
  $$ select public.set_medication_active(current_setting('s3.m1')::uuid, false) $$,
  '42501', null, 'a family member cannot deactivate a medicine');
-- 27.
select throws_ok(
  $$ select public.update_schedule(current_setting('s3.s1')::uuid, array[1]::smallint[], '08:00', 'UTC', 30) $$,
  '42501', null, 'a family member cannot edit a schedule');
-- 28.
select throws_ok(
  $$ select public.deactivate_batch(current_setting('s3.b1')::uuid, null) $$,
  '42501', null, 'a family member cannot deactivate a batch');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');

-- 29.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', 'Y', 'tablet', 1, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '42501', null, 'an unrelated account cannot create a medicine');
-- 30.
select throws_ok(
  $$ select public.set_active_batch(current_setting('s3.b1')::uuid) $$,
  '42501', null, 'an unrelated account cannot move the active batch');

-- Cross-elder IDOR: c2 manages e2 and must not reach e1's plan.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');

-- 31.
select throws_ok(
  $$ select public.set_medication_active(current_setting('s3.m1')::uuid, false) $$,
  '42501', null, 'a manager of another elder cannot deactivate a foreign medicine');
-- 32.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m1')::uuid, array[4]::smallint[], '16:00', 'UTC', 30) $$,
  '42501', null, 'a manager of another elder cannot add a schedule to a foreign medicine');
-- 33.
select is(
  (select count(*) from public.audit_events
    where elder_id = '22222222-2222-2222-2222-222222222222'
      and actor_id = '66666666-6666-6666-6666-666666666666'),
  0::bigint, 'the rejected IDOR attempts write no audit row');

-- ===========================================================================
-- 34-44. Criterion 4: create_medication validation.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 34.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', null, '5 mg', 'tablet', 1, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '23514', 'a medicine name is required', 'a missing name is rejected');
-- 35.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', '   ', '5 mg', 'tablet', 1, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '23514', 'a medicine name is required', 'a whitespace-only name is rejected');
-- 36.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', 1, 'tablet', null,
       '2026-10-01', null) $$,
  '23514', 'instructions are required', 'missing instructions are rejected');
-- 37.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', 1, 'tablet', '  ',
       '2026-10-01', null) $$,
  '23514', 'instructions are required', 'whitespace-only instructions are rejected');
-- 38.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', null, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '23514', 'dose quantity must be greater than zero', 'a missing dose quantity is rejected');
-- 39.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', 0, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '23514', 'dose quantity must be greater than zero', 'a zero dose quantity is rejected');
-- 40.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', -1, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '23514', 'dose quantity must be greater than zero', 'a negative dose quantity is rejected');
-- 41.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', 1, ' ', 'Z',
       '2026-10-01', null) $$,
  '23514', 'a dose unit is required', 'a whitespace-only dose unit is rejected');
-- 42.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'tablet', 1, 'tablet', 'Z',
       '2026-10-01', '2026-09-01') $$,
  '23514', 'the end date cannot be before the start date',
  'an end date before the start date is rejected');
-- 43.
select throws_ok(
  $$ select public.create_medication(
       '22222222-2222-2222-2222-222222222222', 'X', '5 mg', 'powder', 1, 'tablet', 'Z',
       '2026-10-01', null) $$,
  '23514', null, 'an unknown dose form is rejected');

-- 44. A newly created medicine is a draft.
select set_config('s3.m4', public.create_medication(
  '22222222-2222-2222-2222-222222222222',
  'Ibuprofen', '200 mg', 'tablet', 1, 'tablet',
  'Take with food if needed', '2026-10-01', '2026-12-31')::text, true);
select is(
  (select is_active from public.medications where id = current_setting('s3.m4')::uuid),
  false, 'a medicine created by create_medication is inactive (draft)');

-- ===========================================================================
-- 45-48. Criterion 5: active only with an active schedule.
-- ===========================================================================

-- 45.
select throws_ok(
  $$ select public.set_medication_active(current_setting('s3.m4')::uuid, true) $$,
  '23514', 'a medicine needs at least one active schedule before it can be active',
  'a medicine without an active schedule cannot be activated');

select set_config('s3.s4', public.create_schedule(
  current_setting('s3.m4')::uuid, array[1]::smallint[], '21:00',
  'Asia/Singapore', 30)::text, true);

-- 46.
select lives_ok(
  $$ select public.set_medication_active(current_setting('s3.m4')::uuid, true) $$,
  'the medicine can be activated once it has an active schedule');
-- 47.
select is(
  (select is_active from public.medications where id = current_setting('s3.m4')::uuid),
  true, 'the medicine is active after activation');
-- 48.
select is(
  (select deactivated_at from public.medications where id = current_setting('s3.m4')::uuid),
  null::timestamptz, 'activation clears the deactivation timestamp');

-- ===========================================================================
-- 49-59. Criterion 7: schedule canonicalisation and validation.
-- ===========================================================================

-- 49.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[]::smallint[], '10:00', 'Asia/Singapore', 30) $$,
  '23514', 'a schedule needs at least one weekday', 'an empty days_of_week is rejected');
-- 50.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[7]::smallint[], '10:00', 'Asia/Singapore', 30) $$,
  '23514', null, 'an out-of-range weekday is rejected');
-- 51.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[2, null]::smallint[], '10:00', 'Asia/Singapore', 30) $$,
  '23514', null, 'a null weekday element is rejected');
-- 52.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[4]::smallint[], null, 'Asia/Singapore', 30) $$,
  '23514', 'a dose time is required', 'a missing dose time is rejected');
-- 53.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[4]::smallint[], '10:00', 'Not/AZone', 30) $$,
  '23514', null, 'an unknown timezone is rejected');
-- 54.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[4]::smallint[], '10:00', 'Asia/Singapore', 4) $$,
  '23514', 'the grace period must be between 5 and 120 minutes',
  'a grace period below 5 minutes is rejected');
-- 55.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[4]::smallint[], '10:00', 'Asia/Singapore', 121) $$,
  '23514', 'the grace period must be between 5 and 120 minutes',
  'a grace period above 120 minutes is rejected');
-- 56.
select lives_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[4]::smallint[], '10:00', 'Asia/Singapore', 120) $$,
  'a grace period of exactly 120 minutes is accepted');

-- 57. An unsorted array on a fresh slot is accepted and stored canonical.
select set_config('s3.s5', public.create_schedule(
  current_setting('s3.m2')::uuid, array[5, 1, 3]::smallint[], '09:00',
  'Asia/Singapore', 30)::text, true);
select is(
  (select days_of_week from public.medication_schedules where id = current_setting('s3.s5')::uuid),
  array[1, 3, 5]::smallint[], 'an unsorted weekday array is stored sorted');
-- 58. A duplicated, unsorted array that canonicalises to an existing slot is rejected.
select throws_ok(
  $$ select public.create_schedule(
       current_setting('s3.m2')::uuid, array[3, 1, 5, 1]::smallint[], '09:00', 'Asia/Singapore', 30) $$,
  '23505', null, 'a duplicated array that canonicalises to an existing slot is rejected');
-- 59.
select throws_ok(
  $$ select public.create_schedule(
       '99999999-9999-9999-9999-999999999999', array[4]::smallint[], '10:00', 'Asia/Singapore', 30) $$,
  '42501', null, 'a schedule cannot be attached to an unknown medicine');

-- ===========================================================================
-- 60-67. Criterion 6: batch validation and the single active batch.
-- ===========================================================================

-- 60.
select throws_ok(
  $$ select public.create_batch(
       current_setting('s3.m1')::uuid, 5, 'tablet', null, (current_date - 1), null, null, false) $$,
  '23514', null, 'an expiry before the entry date is rejected');
-- 61.
select throws_ok(
  $$ select public.create_batch(
       current_setting('s3.m1')::uuid, -1, 'tablet', null, '2027-01-01', null, null, false) $$,
  '23514', 'batch quantity cannot be negative', 'a negative quantity is rejected');
-- 62.
select throws_ok(
  $$ select public.create_batch(
       current_setting('s3.m1')::uuid, 5, 'tablet', null, '2027-01-01', -1, null, false) $$,
  '23514', null, 'a negative low-stock threshold is rejected');
-- 63.
select throws_ok(
  $$ select public.create_batch(
       current_setting('s3.m1')::uuid, 5, 'tablet', null, '2027-01-01', null, null, true) $$,
  '23505', 'this medicine already has an active batch',
  'a second active batch on the same medicine is rejected');

select set_config('s3.b1b', public.create_batch(
  current_setting('s3.m1')::uuid, 25, 'tablet', 'LOT-A2', '2027-11-30',
  7, null, false)::text, true);

-- 64. set_active_batch moves the active flag in one call.
select public.set_active_batch(current_setting('s3.b1b')::uuid);
select is(
  (select is_active from public.medicine_batches where id = current_setting('s3.b1b')::uuid),
  true, 'set_active_batch activates the requested batch');
-- 65.
select is(
  (select is_active from public.medicine_batches where id = current_setting('s3.b1')::uuid),
  false, 'set_active_batch deactivates the previous active batch');
-- 66.
select is(
  (select count(*) from public.medicine_batches
    where medication_id = current_setting('s3.m1')::uuid and is_active),
  1::bigint, 'exactly one batch of the medicine is active after the move');

-- 67. An expired batch can never become active. `create_batch` refuses an expiry
-- before the entry date, so a legitimately expired batch is back-dated as the
-- superuser: it was entered 30 days ago and expired 5 days ago.
reset role;
with inserted as (
  insert into public.medicine_batches (
    medication_id, quantity, unit, lot_number, expiry_date, low_stock_threshold,
    is_active, created_at)
  values (
    current_setting('s3.m1')::uuid, 5, 'tablet', 'LOT-OLD', (current_date - 5), 2,
    false, now() - interval '30 days')
  returning id
)
select set_config('s3.b_expired', (select id::text from inserted), true);

set local role authenticated;
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select public.set_active_batch(current_setting('s3.b_expired')::uuid) $$,
  '23514', 'an expired batch cannot be made active',
  'set_active_batch rejects an expired batch');

-- ===========================================================================
-- 68-75. Criterion 8: soft deactivation keeps rows and frees slots.
-- ===========================================================================

-- 68. The hand-off contract forbids an active medicine with no active schedule.
select throws_ok(
  $$ select public.set_schedule_active(current_setting('s3.s1')::uuid, false) $$,
  '23514', 'deactivate the medicine before its last active schedule',
  'the last active schedule of an active medicine cannot be deactivated');

select public.set_medication_active(current_setting('s3.m1')::uuid, false);

-- 69.
select is(
  (select is_active from public.medications where id = current_setting('s3.m1')::uuid),
  false, 'deactivating a medicine keeps the row and clears is_active');
-- 70.
select ok(
  (select deactivated_at is not null from public.medications
    where id = current_setting('s3.m1')::uuid),
  'deactivating a medicine stamps deactivated_at');

select public.set_schedule_active(current_setting('s3.s1')::uuid, false);

-- 71.
select ok(
  (select not is_active from public.medication_schedules
    where id = current_setting('s3.s1')::uuid),
  'deactivating a schedule keeps the row and clears is_active');

select set_config('s3.s1b', public.create_schedule(
  current_setting('s3.m1')::uuid, array[1, 3, 5]::smallint[], '08:00',
  'Asia/Singapore', 45)::text, true);

-- 72.
select ok(
  current_setting('s3.s1b') <> '',
  'a new active schedule for the same slot succeeds after deactivation');
-- 73.
select is(
  (select grace_minutes from public.medication_schedules where id = current_setting('s3.s1b')::uuid),
  45, 'the replacement schedule carries its own grace period');

select public.deactivate_batch(current_setting('s3.b1b')::uuid, 'pack finished');

-- 74.
select ok(
  (select not is_active from public.medicine_batches where id = current_setting('s3.b1b')::uuid),
  'deactivating a batch keeps the row and clears is_active');
-- 75.
select lives_ok(
  $$ select public.set_active_batch(current_setting('s3.b1')::uuid) $$,
  'a batch can be made active again once the slot is free');

-- ===========================================================================
-- 76-85. Criterion 9: exactly one audit row per state change.
-- ===========================================================================

-- 76.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.m1')::uuid and action = 'medication.created'),
  1::bigint, 'create_medication writes exactly one medication.created row');
-- 77.
select is(
  (select target_table from public.audit_events
    where target_id = current_setting('s3.m1')::uuid and action = 'medication.created'),
  'medications', 'the medication audit row names its table');

select set_config('s3.audits_before', (
  select count(*)::text from public.audit_events
  where target_id = current_setting('s3.m1')::uuid and action = 'medication.updated'), true);

select public.update_medication(
  current_setting('s3.m1')::uuid, 'Amlodipine', '10 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-10-01', null);

-- 78.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.m1')::uuid and action = 'medication.updated'),
  current_setting('s3.audits_before')::bigint + 1,
  'a changing medication update writes exactly one medication.updated row');
-- 79.
select ok(
  (select before_summary is not null and after_summary is not null
   from public.audit_events
   where target_id = current_setting('s3.m1')::uuid and action = 'medication.updated'
   order by id desc limit 1),
  'the update audit row carries both snapshots');

-- 80. A no-op update writes nothing.
select public.update_medication(
  current_setting('s3.m1')::uuid, 'Amlodipine', '10 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-10-01', null);
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.m1')::uuid and action = 'medication.updated'),
  current_setting('s3.audits_before')::bigint + 1,
  'a no-op medication update writes no audit row');

select set_config('s3.react_before', (
  select count(*)::text from public.audit_events
  where target_id = current_setting('s3.m1')::uuid and action = 'medication.reactivated'), true);

select public.set_medication_active(current_setting('s3.m1')::uuid, true);

-- 81.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.m1')::uuid and action = 'medication.reactivated'),
  current_setting('s3.react_before')::bigint + 1,
  'reactivating writes medication.reactivated');
-- 82.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.m1')::uuid and action = 'medication.deactivated'),
  1::bigint, 'deactivating writes medication.deactivated');
-- 83.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.s1b')::uuid and action = 'schedule.created'),
  1::bigint, 'create_schedule writes schedule.created');
-- 84.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s3.s1')::uuid and action = 'schedule.deactivated'),
  1::bigint, 'deactivating a schedule writes schedule.deactivated');
-- 85. The move made in test 64 replaced the then-active b1.
select is(
  (select after_summary ->> 'previous_batch_id' from public.audit_events
    where target_id = current_setting('s3.b1b')::uuid and action = 'batch.activated'
    order by id desc limit 1),
  current_setting('s3.b1'),
  'batch.activated records which batch it replaced');

-- ===========================================================================
-- 86-96. Structure, serialisation and privileges.
-- Read as the superuser so nothing is hidden by RLS.
-- ===========================================================================

reset role;

-- 86.
select ok(
  exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where c.relname = 'medicine_batches_active_key' and i.indisunique
      and i.indpred is not null),
  'a partial unique index allows at most one active batch per medicine');
-- 87.
select ok(
  exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where c.relname = 'medication_schedules_active_slot_key' and i.indisunique
      and i.indpred is not null),
  'a partial unique index allows at most one active schedule per slot');
-- 88. Criterion 10: the active-slot change is serialised by an advisory lock.
select ok(
  pg_get_functiondef('public.set_active_batch(uuid)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'set_active_batch serialises the active-slot change with an advisory lock');
-- 89.
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where relname in ('medications', 'medication_schedules', 'medicine_batches')),
  'all three tables have RLS enabled');
-- 90.
select ok(
  (select bool_and(confdeltype = 'r') from pg_constraint
    where conname in (
      'medications_elder_id_fkey', 'medications_created_by_fkey',
      'medication_schedules_medication_id_fkey',
      'medicine_batches_medication_id_fkey')),
  'every new foreign key is ON DELETE RESTRICT');
-- 91. A schedule cannot exist without its medicine.
select throws_ok(
  $$ insert into public.medication_schedules (medication_id, days_of_week, time_of_day, timezone)
       values ('99999999-9999-9999-9999-999999999999', array[1]::smallint[], '08:00', 'UTC') $$,
  '23503', null, 'a schedule cannot exist without a medicine');
-- 92.
select throws_ok(
  $$ insert into public.medicine_batches (medication_id, quantity, unit, expiry_date)
       values ('99999999-9999-9999-9999-999999999999', 1, 'tablet', '2027-01-01') $$,
  '23503', null, 'a batch cannot exist without a medicine');
-- 93.
select ok(
  has_function_privilege('authenticated',
    'public.create_medication(uuid,text,text,text,numeric,text,text,date,date)', 'execute')
  and has_function_privilege('authenticated',
    'public.update_medication(uuid,text,text,text,numeric,text,text,date,date)', 'execute')
  and has_function_privilege('authenticated', 'public.set_medication_active(uuid,boolean)', 'execute')
  and has_function_privilege('authenticated',
    'public.create_schedule(uuid,smallint[],time,text,integer)', 'execute')
  and has_function_privilege('authenticated',
    'public.update_schedule(uuid,smallint[],time,text,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.set_schedule_active(uuid,boolean)', 'execute')
  and has_function_privilege('authenticated',
    'public.create_batch(uuid,numeric,text,text,date,numeric,text,boolean)', 'execute')
  and has_function_privilege('authenticated',
    'public.update_batch(uuid,numeric,text,text,date,numeric,text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_active_batch(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.deactivate_batch(uuid,text)', 'execute'),
  'authenticated may execute all ten public RPCs');
-- 94.
select ok(
  not has_function_privilege('anon',
    'public.create_medication(uuid,text,text,text,numeric,text,text,date,date)', 'execute')
  and not has_function_privilege('authenticated',
    'public.canonicalize_days_of_week(smallint[])', 'execute')
  and not has_function_privilege('authenticated',
    'public.assert_valid_timezone(text)', 'execute'),
  'anon cannot execute the write RPCs and the internal validators stay internal');
-- 95. `medication_elder_id` is the documented exception: an RLS policy calls it.
select ok(
  has_function_privilege('authenticated', 'public.medication_elder_id(uuid)', 'execute'),
  'authenticated may execute medication_elder_id because a policy calls it');
-- 96.
select ok(
  has_table_privilege('authenticated', 'public.medications', 'select')
  and not has_table_privilege('authenticated', 'public.medications', 'insert')
  and not has_table_privilege('authenticated', 'public.medications', 'update')
  and not has_table_privilege('authenticated', 'public.medications', 'delete'),
  'authenticated may select but not write medications directly');

select * from finish();
rollback;
