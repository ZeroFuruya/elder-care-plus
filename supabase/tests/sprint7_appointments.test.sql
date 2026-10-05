-- Sprint 7 invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-7.md as database tests: the appointment state machine and its
-- terminal invariants, the conditional fields, the four guarded RPCs and their
-- authorization, the stable reminder dedup key and its idempotency, recipient and
-- deactivation filtering, the widened notification vocabulary, and RLS scoping.
--
-- True concurrency (complete racing cancel, a sweep racing a lifecycle change) and
-- the real pg_cron cadence cannot be created in a single-session pgTAP harness; as
-- in Sprints 2-5 the serialised equivalent is proven and the job's existence is
-- asserted. Values travel with set_config/current_setting.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(52);

-- JWT claims helper (same as Sprints 1-5).
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

-- The reminder sweep is revoked from every client role; the definer helper is how
-- the suite reaches it (same trick as Sprint 5's run_alerts).
create function pg_temp.reminders_at(p_reference timestamptz)
returns integer language sql security definer set search_path = public, pg_temp
as $$ select public.check_appointment_reminders_at(p_reference); $$;

create function pg_temp.force_cancel_at(p_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.appointments set cancelled_at = now() where id = p_id; $$;

create function pg_temp.force_cancel_note(p_id uuid, p_note text)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.appointments set cancel_note = p_note where id = p_id; $$;

create function pg_temp.deactivate_profile(p_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.profiles set deactivated_at = now() where id = p_id; $$;

-- Reaches the notification check constraint past the missing client write grant.
create function pg_temp.insert_notification(p_event text)
returns void language sql security definer set search_path = public, pg_temp
as $$
  insert into public.notifications (
    recipient_id, elder_id, event_type, target_table, target_id, dedup_key
  ) values (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    p_event, 'appointments', gen_random_uuid(), 'bogus'
  );
$$;

-- ---------------------------------------------------------------------------
-- Fixtures. Inserting an auth user creates the profile via the trigger.
--   c1 caregiver A (manages e1)   e1 elder A   f1 family F (views e1)
--   u1 unrelated elder            c2 caregiver B (manages e2)   e2 elder B
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

-- The care circle, through the Sprint 1 RPCs only.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s7.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's7.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s7.code_a')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s7.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's7.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s7.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s7.link_f')::uuid);
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s7.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's7.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s7.code_b')) ->> 'link_id', ''),
  true);

-- ---------------------------------------------------------------------------
-- Fixture appointments, through the RPCs.
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

select set_config('s7.a_visit', public.create_appointment(
  '22222222-2222-2222-2222-222222222222', 'visit', 'Cardiology checkup',
  current_date + 2, '10:00', 'Asia/Singapore', 'Dr. Maria Santos',
  'Baybay Medical Center', 'Baybay', null, null,
  'Bring recent blood pressure records', 1440, true)::text, true);

select set_config('s7.a_home', public.create_appointment(
  '22222222-2222-2222-2222-222222222222', 'in_home', 'Home checkup',
  current_date + 10, '11:00', 'Asia/Singapore', 'Nurse Ana', null, null,
  '12 Mabini Street', '+639171234567', null, 1440, true)::text, true);

select set_config('s7.a_off', public.create_appointment(
  '22222222-2222-2222-2222-222222222222', 'visit', 'No reminder visit',
  current_date + 4, '12:00', 'Asia/Singapore', 'Dr. Santos', 'Ormoc Diagnostic Center',
  'Ormoc', null, null, null, null, true)::text, true);

select set_config('s7.a_done', public.create_appointment(
  '22222222-2222-2222-2222-222222222222', 'visit', 'Completed visit',
  current_date + 5, '13:00', 'Asia/Singapore', 'Dr. Santos', 'Dr. Santos Clinic',
  'Ormoc', null, null, 'Follow up', 1440, true)::text, true);
select public.complete_appointment(current_setting('s7.a_done')::uuid, 'All good');

select set_config('s7.a_cancel', public.create_appointment(
  '22222222-2222-2222-2222-222222222222', 'visit', 'Cancelled visit',
  current_date + 6, '14:00', 'Asia/Singapore', 'Dr. Santos', 'Dr. Santos Clinic',
  'Ormoc', null, null, null, 1440, true)::text, true);
select public.cancel_appointment(current_setting('s7.a_cancel')::uuid, 'Rescheduled');

select set_config('s7.a_ded', public.create_appointment(
  '22222222-2222-2222-2222-222222222222', 'visit', 'Deactivation visit',
  current_date + 7, '15:00', 'Asia/Singapore', 'Dr. Santos', 'Dr. Santos Clinic',
  'Ormoc', null, null, null, 60, true)::text, true);

select set_config('s7.count_e1', (
  select count(*)::text from public.appointments
  where elder_id = '22222222-2222-2222-2222-222222222222'), true);

-- e2's appointment, for the cross-elder authorization test.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select public.create_appointment(
  '77777777-7777-7777-7777-777777777777', 'visit', 'Other elder visit',
  current_date + 2, '10:00', 'Asia/Singapore', 'Dr. Cruz', 'City Clinic',
  'Ormoc', null, null, null, 1440, true);

-- ===========================================================================
-- 1-14. Creation, the conditional fields, and direct-write denial.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 1.
select ok(current_setting('s7.a_visit') is not null,
  'a manager can create a clinic visit');
-- 2.
select is((select state = 'upcoming' and completed_at is null and cancelled_at is null
  from public.appointments where id = current_setting('s7.a_visit')::uuid), true,
  'a new appointment is upcoming with no terminal timestamps');
-- 3.
select is((select created_by from public.appointments
  where id = current_setting('s7.a_visit')::uuid),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'created_by is the authenticated manager');
-- 4.
select is((select reminder_lead_minutes = 1440 and notify_elder
  from public.appointments where id = current_setting('s7.a_visit')::uuid), true,
  'the reminder settings round-trip');

-- 5.
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Missing place',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', null, null, null, null, null, 1440, true)
  $$, '23514', null, 'a clinic visit without facility/location is rejected');
-- 6.
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'in_home', 'Missing home',
    current_date + 1, '09:00', 'Asia/Singapore', 'Nurse', null, null, null, null, null, 1440, true)
  $$, '23514', null, 'an in-home visit without address/visitor/contact is rejected');
-- 7.
select ok(current_setting('s7.a_home') is not null,
  'an in-home visit with all conditional fields is accepted');
-- 8.
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', '   ',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '23514', null, 'a whitespace-only title is rejected');
-- 9.
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Bad zone',
    current_date + 1, '09:00', 'Mars/Olympus', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '23514', null, 'an unknown timezone is rejected');
-- 10.
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Bad lead',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 45, true)
  $$, '23514', null, 'an unsupported reminder lead time is rejected');
-- 11.
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', repeat('x', 121),
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '23514', null, 'an over-long title is rejected');
-- 12.
select throws_ok($$
  insert into public.appointments (elder_id, appointment_type, title, start_at, timezone, created_by)
  values ('22222222-2222-2222-2222-222222222222', 'visit', 'Direct', now(), 'Asia/Singapore',
          '11111111-1111-1111-1111-111111111111')
  $$, '42501', null, 'a client cannot insert an appointment directly');
-- 13.
select throws_ok($$ update public.appointments set title = 'Hacked' $$, '42501', null,
  'a client cannot update an appointment directly');
-- 14.
select is((select count(*) from public.audit_events
  where action = 'appointment.created' and target_id = current_setting('s7.a_visit')::uuid),
  1::bigint, 'creation writes exactly one audit row');

-- ===========================================================================
-- 15-18. Editing is allowed only while upcoming; a no-op writes nothing.
-- ===========================================================================

-- 15.
select lives_ok($$
  select public.update_appointment(
    current_setting('s7.a_visit')::uuid, 'visit', 'Cardiology checkup (moved)',
    current_date + 2, '10:30', 'Asia/Singapore', 'Dr. Maria Santos', 'Baybay Medical Center',
    'Baybay', null, null,
    'Bring BP records', 1440, true)
  $$, 'a manager can edit an upcoming appointment');
-- 16.
select is((select count(*) from public.audit_events
  where action = 'appointment.updated' and target_id = current_setting('s7.a_visit')::uuid),
  1::bigint, 'an edit writes exactly one audit row');
-- 17.
select lives_ok($$
  select public.update_appointment(
    current_setting('s7.a_visit')::uuid, 'visit', 'Cardiology checkup (moved)',
    current_date + 2, '10:30', 'Asia/Singapore', 'Dr. Maria Santos', 'Baybay Medical Center',
    'Baybay', null, null,
    'Bring BP records', 1440, true)
  $$, 'saving an unchanged appointment is a no-op');
-- 18.
select is((select count(*) from public.audit_events
  where action = 'appointment.updated' and target_id = current_setting('s7.a_visit')::uuid),
  1::bigint, 'the no-op wrote no second audit row');

-- ===========================================================================
-- 19-29. Lifecycle: terminal states, no-ops, and rejection of cross-transitions.
-- ===========================================================================

-- 19.
select ok(public.complete_appointment(current_setting('s7.a_done')::uuid, null) is not null,
  'a manager can complete an upcoming appointment');
-- 20.
select is((select state = 'completed' and completed_at is not null and cancelled_at is null
  and completion_note = 'All good'
  from public.appointments where id = current_setting('s7.a_done')::uuid), true,
  'completion records the terminal timestamp and note');
-- 21.
select is((select count(*) from public.audit_events
  where action = 'appointment.completed' and target_id = current_setting('s7.a_done')::uuid),
  1::bigint, 'completion writes exactly one audit row');
-- 22.
select ok(public.complete_appointment(current_setting('s7.a_done')::uuid, null) is not null,
  'repeating completion is a no-op');
-- 23.
select is((select count(*) from public.audit_events
  where action = 'appointment.completed' and target_id = current_setting('s7.a_done')::uuid),
  1::bigint, 'the repeated completion wrote no second audit row');
-- 24.
select throws_ok($$
  select public.cancel_appointment(current_setting('s7.a_done')::uuid, null)
  $$, '23514', null, 'a completed appointment cannot be cancelled');
-- 25.
select ok(public.cancel_appointment(current_setting('s7.a_cancel')::uuid, null) is not null,
  'a manager can cancel an upcoming appointment');
-- 26.
select is((select state = 'cancelled' and cancelled_at is not null and completed_at is null
  and cancel_note = 'Rescheduled'
  from public.appointments where id = current_setting('s7.a_cancel')::uuid), true,
  'cancellation records the terminal timestamp and note');
-- 27.
select ok(public.cancel_appointment(current_setting('s7.a_cancel')::uuid, null) is not null,
  'repeating cancellation is a no-op');
-- 28.
select throws_ok($$
  select public.complete_appointment(current_setting('s7.a_cancel')::uuid, null)
  $$, '23514', null, 'a cancelled appointment cannot be completed');
-- 29.
select throws_ok($$
  select public.update_appointment(
    current_setting('s7.a_done')::uuid, 'visit', 'Edited too late',
    current_date + 5, '13:00', 'Asia/Singapore', 'Dr. Santos', 'Clinic', 'City', null, null,
    null, 1440, true)
  $$, '23514', null, 'a terminal appointment cannot be edited');

-- ===========================================================================
-- 30-31. The state-consistency constraints hold under a forced write.
-- ===========================================================================

-- 30.
select throws_ok($$
  select pg_temp.force_cancel_at(current_setting('s7.a_visit')::uuid)
  $$, '23514', null, 'an upcoming row can never carry a terminal timestamp');
-- 31.
select throws_ok($$
  select pg_temp.force_cancel_note(current_setting('s7.a_visit')::uuid, 'nope')
  $$, '23514', null, 'a cancellation note is illegal while upcoming');

-- ===========================================================================
-- 32-38. Authorization: manager-only, and rejected calls write nothing.
-- ===========================================================================

-- 32.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Elder made this',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '42501', null, 'the elder cannot create an appointment');
-- 33.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Family made this',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '42501', null, 'a family member cannot create an appointment');
-- 34.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Unrelated made this',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '42501', null, 'an unrelated account cannot create an appointment');
-- 35.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select throws_ok($$
  select public.create_appointment(
    '22222222-2222-2222-2222-222222222222', 'visit', 'Other manager made this',
    current_date + 1, '09:00', 'Asia/Singapore', 'Dr. X', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '42501', null, 'a manager of another elder cannot write for this elder');
-- 36.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok($$
  select public.complete_appointment(current_setting('s7.a_off')::uuid, null)
  $$, '42501', null, 'the elder cannot complete an appointment');
-- 37.
select throws_ok($$
  select public.update_appointment(
    current_setting('s7.a_off')::uuid, 'visit', 'Elder edit', current_date + 4, '12:00',
    'Asia/Singapore', 'Dr. Santos', 'Clinic', 'City', null, null, null, 1440, true)
  $$, '42501', null, 'the elder cannot edit an appointment');
-- 38.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.appointments
  where elder_id = '22222222-2222-2222-2222-222222222222'),
  current_setting('s7.count_e1')::bigint,
  'no rejected call wrote an appointment row');

-- ===========================================================================
-- 39-43. RLS: circle-scoped reads, recipient-only rows.
-- ===========================================================================

-- 39.
select ok((select count(*) from public.appointments) > 0,
  'the manager reads the linked elder appointments');
select set_config('s7.readable_e1', (
  select count(*)::text from public.appointments), true);

-- 40.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.appointments),
  current_setting('s7.readable_e1')::bigint, 'the elder reads the same appointments');
-- 41.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.appointments),
  current_setting('s7.readable_e1')::bigint, 'the family member reads the same appointments');
-- 42.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select is((select count(*) from public.appointments), 0::bigint,
  'an unrelated account reads no appointment');
-- 43.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.appointments
  where elder_id = '77777777-7777-7777-7777-777777777777'), 0::bigint,
  'a manager reads nothing for another elder');
-- 44.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok($$
  insert into public.appointments (elder_id, appointment_type, title, start_at, timezone, created_by)
  values ('22222222-2222-2222-2222-222222222222', 'visit', 'Elder direct', now(),
          'Asia/Singapore', '22222222-2222-2222-2222-222222222222')
  $$, '42501', null, 'the elder cannot write an appointment directly');

-- ===========================================================================
-- 45-50. Reminders: one per appointment, stable dedup key, recipient filtering.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 45.
select is(has_function_privilege('authenticated', 'public.check_appointment_reminders()',
  'EXECUTE'), false, 'the reminder sweep is not client-executable');

select set_config('s7.ref_visit', (
  select (start_at - interval '1 minute')::text from public.appointments
  where id = current_setting('s7.a_visit')::uuid), true);

-- 46.
select is(pg_temp.reminders_at(current_setting('s7.ref_visit')::timestamptz), 2,
  'the elder and the manager each get one reminder');
-- 47.
select is(pg_temp.reminders_at(current_setting('s7.ref_visit')::timestamptz), 0,
  'a repeated sweep at the same instant writes nothing');
-- 48.
select is((select count(*) from public.notifications
  where event_type = 'appointment_upcoming'
    and target_id = current_setting('s7.a_visit')::uuid
    and recipient_id = '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'a family member is never a reminder recipient');

-- Changing the lead time must not re-emit for the same appointment.
select public.update_appointment(
  current_setting('s7.a_visit')::uuid, 'visit', 'Cardiology checkup (moved)',
  current_date + 2, '10:30', 'Asia/Singapore', 'Dr. Maria Santos', 'Baybay Medical Center',
  'Baybay', null, null,
  'Bring BP records', 180, true);
-- 49.
select is(pg_temp.reminders_at(current_setting('s7.ref_visit')::timestamptz), 0,
  'editing the lead time after emission does not create a second reminder');

-- 50.
select is(pg_temp.reminders_at((select (start_at - interval '1 minute')
  from public.appointments where id = current_setting('s7.a_off')::uuid)), 0,
  'an appointment with the reminder off receives none');

-- ===========================================================================
-- 51-52. Terminal appointments are never reminded; the event vocabulary is closed.
-- ===========================================================================

-- 51.
select is(pg_temp.reminders_at((select (start_at - interval '1 minute')
  from public.appointments where id = current_setting('s7.a_done')::uuid)), 0,
  'a completed appointment is never reminded');

-- 52.
select throws_ok($$
  select pg_temp.insert_notification('appointment_bogus')
  $$, '23514', null, 'an unknown notification event type is rejected');

select * from finish();
rollback;
