-- Sprint 4 invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-4.md as database tests: occurrence generation and its window
-- cap, the elder's one guarded confirmation, database-level idempotency, the
-- atomic conditional stock decrement plus every no-decrement reason, the
-- server-only missed transition, RLS scoping (including the owner's 2026-09-30
-- full family plan visibility), append-only ledgers, and the Sprint 3 hand-off
-- that a plan edit affects future occurrences only.
--
-- Acceptance criterion 2's *true* concurrency cannot be created in a
-- single-session pgTAP harness. As in Sprints 2 and 3 the serialised equivalent
-- is proven instead - a second confirmation updates nothing and reports
-- `duplicate` - and the conditional predicates that make that safe are asserted
-- against the function bodies.
--
-- Values are carried between statements with set_config/current_setting rather
-- than psql variables, so the file does not depend on the psql client.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(101);

-- JWT claims helper (same as Sprints 1-3).
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

-- Deterministic fixtures need to set facts the product never sets from a client:
-- a clock-relative scheduled_at, a forced cancellation, an aged batch and a
-- deactivated account. These run as the definer so RLS cannot block them.
create function pg_temp.force_scheduled_at(p_id uuid, p_when timestamptz)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.dose_events set scheduled_at = p_when where id = p_id; $$;

create function pg_temp.force_cancelled(p_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.dose_events set cancelled_at = now() where id = p_id; $$;

create function pg_temp.force_expired_batch(p_batch_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$
  update public.medicine_batches
     set created_at = now() - interval '10 days',
         expiry_date = current_date - 5
   where id = p_batch_id;
$$;

create function pg_temp.deactivate_profile(p_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.profiles set deactivated_at = now() where id = p_id; $$;

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
select set_config('s4.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's4.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s4.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s4.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's4.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s4.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s4.link_f')::uuid);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s4.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's4.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s4.code_b')) ->> 'link_id', ''),
  true);

-- ---------------------------------------------------------------------------
-- e1's plan, all through the Sprint 3 RPCs. Every active medicine carries an
-- all-week schedule, so activating it generates one occurrence per day in the
-- open window (today .. today+3): four per active medicine, eight active
-- medicines = thirty-two.
--   m1      Amlodipine  happy path + due-window cases (batch 30 tablet)
--   m_unit              batch unit 'capsule' vs dose unit 'tablet'
--   m_nobatch           no batch at all
--   m_expired           an active batch forced into the past
--   m_short             active batch with quantity 0
--   m_exact             active batch with quantity equal to the dose
--   m_recon             plan-edit reconciliation (Sprint 3 hand-off)
--   m_last              no-manager and deactivated-account cases
--   m_draft             never activated, so it must generate nothing
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

select set_config('s4.m1', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Amlodipine', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_unit', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Unitclash', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_nobatch', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Nobatch', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_expired', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Expired', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_short', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Short', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_exact', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Exact', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_recon', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Recon', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_last', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Last', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4.m_draft', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Draft', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);

select set_config('s4.s1', public.create_schedule(
  current_setting('s4.m1')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_unit', public.create_schedule(
  current_setting('s4.m_unit')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '09:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_nobatch', public.create_schedule(
  current_setting('s4.m_nobatch')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '10:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_expired', public.create_schedule(
  current_setting('s4.m_expired')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '11:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_short', public.create_schedule(
  current_setting('s4.m_short')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '12:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_exact', public.create_schedule(
  current_setting('s4.m_exact')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '13:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_recon', public.create_schedule(
  current_setting('s4.m_recon')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '06:00',
  'UTC', 20)::text, true);
select set_config('s4.s_last', public.create_schedule(
  current_setting('s4.m_last')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '14:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4.s_draft', public.create_schedule(
  current_setting('s4.m_draft')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '15:00',
  'Asia/Singapore', 30)::text, true);

select public.set_medication_active(current_setting('s4.m1')::uuid, true);
select public.set_medication_active(current_setting('s4.m_unit')::uuid, true);
select public.set_medication_active(current_setting('s4.m_nobatch')::uuid, true);
select public.set_medication_active(current_setting('s4.m_expired')::uuid, true);
select public.set_medication_active(current_setting('s4.m_short')::uuid, true);
select public.set_medication_active(current_setting('s4.m_exact')::uuid, true);
select public.set_medication_active(current_setting('s4.m_recon')::uuid, true);
select public.set_medication_active(current_setting('s4.m_last')::uuid, true);
-- m_draft is deliberately never activated.

select set_config('s4.b1', public.create_batch(
  current_setting('s4.m1')::uuid, 30, 'tablet', 'LOT-A1', '2027-12-31', 7, null, true)::text, true);
select set_config('s4.b_unit', public.create_batch(
  current_setting('s4.m_unit')::uuid, 10, 'capsule', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4.b_expired', public.create_batch(
  current_setting('s4.m_expired')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4.b_short', public.create_batch(
  current_setting('s4.m_short')::uuid, 0, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4.b_exact', public.create_batch(
  current_setting('s4.m_exact')::uuid, 1, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4.b_recon', public.create_batch(
  current_setting('s4.m_recon')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4.b_last', public.create_batch(
  current_setting('s4.m_last')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);
-- m_nobatch deliberately gets no batch.

-- e2's plan, for the cross-recipient notification test.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s4.m3', public.create_medication(
  '77777777-7777-7777-7777-777777777777', 'Aspirin', '100 mg', 'tablet', 1, 'tablet',
  'Take after dinner', '2026-01-01', null)::text, true);
select set_config('s4.s3', public.create_schedule(
  current_setting('s4.m3')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '20:00',
  'Asia/Singapore', 30)::text, true);
select public.set_medication_active(current_setting('s4.m3')::uuid, true);
select set_config('s4.b3', public.create_batch(
  current_setting('s4.m3')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);

-- Capture the occurrence ids under test before any timing is forced.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

select set_config('s4.d1', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m1')::uuid order by scheduled_at, id offset 0 limit 1), true);
select set_config('s4.d2', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m1')::uuid order by scheduled_at, id offset 1 limit 1), true);
select set_config('s4.d3', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m1')::uuid order by scheduled_at, id offset 2 limit 1), true);
select set_config('s4.d4', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m1')::uuid order by scheduled_at, id offset 3 limit 1), true);

select set_config('s4.d_unit', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_unit')::uuid order by scheduled_at, id limit 1), true);
select set_config('s4.d_nobatch', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_nobatch')::uuid order by scheduled_at, id limit 1), true);
select set_config('s4.d_expired', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_expired')::uuid order by scheduled_at, id limit 1), true);
select set_config('s4.d_short', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_short')::uuid order by scheduled_at, id limit 1), true);
select set_config('s4.d_exact', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_exact')::uuid order by scheduled_at, id limit 1), true);
select set_config('s4.d_exact2', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_exact')::uuid order by scheduled_at, id offset 1 limit 1), true);
select set_config('s4.d_last1', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_last')::uuid order by scheduled_at, id offset 0 limit 1), true);
select set_config('s4.d_last2', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m_last')::uuid order by scheduled_at, id offset 1 limit 1), true);

select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config('s4.d_e2', (select id::text from public.dose_events
  where medication_id = current_setting('s4.m3')::uuid order by scheduled_at, id limit 1), true);

-- ===========================================================================
-- 1-4. Criterion 8: reads are scoped to the care circle. The owner's
-- 2026-09-30 decision gives the family member the whole plan and adherence
-- record, so the family count matches the manager's.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 1. Eight active medicines x four days.
select is((select count(*) from public.dose_events), 32::bigint,
  'the manager reads the thirty-two generated occurrences');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 2.
select is((select count(*) from public.dose_events), 32::bigint,
  'the elder reads the same occurrences');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 3. Full plan visibility: the family member reads the same rows, not a summary.
select is((select count(*) from public.dose_events), 32::bigint,
  'the family member reads the same occurrences under full plan visibility');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 4.
select is((select count(*) from public.dose_events), 0::bigint,
  'an unrelated account reads no occurrence');

-- ===========================================================================
-- 5-15. Criterion 6: generation is idempotent, authorized and window-capped,
-- and writes no notification.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s4.notifs_before', (select count(*)::text from public.notifications), true);

-- 5.
select is(public.ensure_dose_events('22222222-2222-2222-2222-222222222222', current_date, current_date),
  0, 're-running generation for today creates nothing new');
-- 6.
select is((select count(*) from public.dose_events), 32::bigint,
  'the occurrence count is unchanged');
-- 7.
select throws_ok(
  $$ select public.ensure_dose_events('22222222-2222-2222-2222-222222222222', current_date, current_date + 4) $$,
  '23514', null, 'a window wider than four days is rejected');
-- 8.
select throws_ok(
  $$ select public.ensure_dose_events('22222222-2222-2222-2222-222222222222', current_date - 2, current_date) $$,
  '23514', null, 'a window starting before yesterday is rejected');
-- 9.
select throws_ok(
  $$ select public.ensure_dose_events('22222222-2222-2222-2222-222222222222', current_date + 3, current_date + 4) $$,
  '23514', null, 'a window ending after tomorrow plus three is rejected');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 10.
select throws_ok(
  $$ select public.ensure_dose_events('22222222-2222-2222-2222-222222222222', current_date, current_date) $$,
  '42501', null, 'an unrelated account cannot generate for another elder');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 11. An active family member is authorized.
select is(public.ensure_dose_events('22222222-2222-2222-2222-222222222222', current_date, current_date),
  0, 'an active family member may request generation');

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 12.
select is((select count(*) from public.notifications), current_setting('s4.notifs_before')::bigint,
  'generation writes no notification, so it cannot be used for spam');
-- 13.
select is(
  (select dose_quantity = 1 and dose_unit = 'tablet' and grace_minutes = 30
     and timezone = 'Asia/Singapore'
   from public.dose_events where id = current_setting('s4.d1')::uuid),
  true, 'an occurrence snapshots the dose, unit, grace and zone at generation');
-- 14. The conversion is asserted with the SQL expression itself, so the test
--     does not need (and deliberately does not have) EXECUTE on the internal
--     helper.
select is(
  (select scheduled_at = (scheduled_local_date + '08:00'::time) at time zone 'Asia/Singapore'
   from public.dose_events where id = current_setting('s4.d1')::uuid),
  true, 'the stored instant is the local slot in the schedule zone');
-- 15.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4.m_draft')::uuid), 0::bigint,
  'an inactive medicine generates no occurrence');

-- ===========================================================================
-- 16-27. Criterion 1: one confirmation, one set of side effects, forever.
-- The caller is now the elder, the only role `confirm_dose` accepts.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select pg_temp.force_scheduled_at(current_setting('s4.d1')::uuid, now() - interval '1 minute');
select set_config('s4.b1_qty_before',
  (select quantity::text from public.medicine_batches where id = current_setting('s4.b1')::uuid), true);

-- 16.
select is((public.confirm_dose(current_setting('s4.d1')::uuid) ->> 'status'), 'taken',
  'a due dose confirms as taken');
-- 17.
select is((select count(*) from public.dose_events
  where id = current_setting('s4.d1')::uuid and taken_at is not null), 1::bigint,
  'exactly one taken_at is stored');
-- 18.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4.d1')::uuid and action = 'dose.confirmed'), 1::bigint,
  'exactly one dose.confirmed audit row');
-- 19.
select is((select count(*) from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d1')::uuid), 1::bigint,
  'exactly one inventory transaction');
-- 20.
select is((select delta from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d1')::uuid), (-1)::numeric,
  'the decrement is the snapshotted dose quantity');
-- 21-22. Read as the manager: notifications are recipient-only, and the elder is
--        not the recipient.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 21.
select is((select count(*) from public.notifications
  where target_id = current_setting('s4.d1')::uuid and event_type = 'dose_confirmed'), 1::bigint,
  'exactly one dose_confirmed notification for the manager');
-- 22.
select is((select recipient_id from public.notifications
  where target_id = current_setting('s4.d1')::uuid and event_type = 'dose_confirmed'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the notification goes to the linked manager');
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 23.
select is((select quantity from public.medicine_batches where id = current_setting('s4.b1')::uuid),
  current_setting('s4.b1_qty_before')::numeric - 1,
  'the active batch is decremented by exactly the dose once');
-- 24.
select is((select count(*) from public.dose_events
  where id = current_setting('s4.d1')::uuid and confirmed_by is not null), 1::bigint,
  'the confirmation records its confirmer');
-- 25. The retry the elder's double tap would create.
select is((public.confirm_dose(current_setting('s4.d1')::uuid) ->> 'duplicate'), 'true',
  'a second confirmation reports a duplicate');
-- 26.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4.d1')::uuid and action = 'dose.confirmed'), 1::bigint,
  'a repeated confirmation writes no second audit row');
-- 27.
select is((select quantity from public.medicine_batches where id = current_setting('s4.b1')::uuid),
  current_setting('s4.b1_qty_before')::numeric - 1,
  'a repeated confirmation never double-decrements');

-- ===========================================================================
-- 28-38. Criterion 3: only a dose inside its due window is confirmable.
-- ===========================================================================

-- 28-29. Still upcoming.
select pg_temp.force_scheduled_at(current_setting('s4.d2')::uuid, now() + interval '1 hour');
-- 28.
select is((public.confirm_dose(current_setting('s4.d2')::uuid) ->> 'status'), 'upcoming',
  'a dose scheduled in the future is not confirmable');
-- 29.
select is((select taken_at is null from public.dose_events
  where id = current_setting('s4.d2')::uuid), true,
  'an upcoming dose keeps no confirmation');

-- 30-31. Cancelled.
select pg_temp.force_cancelled(current_setting('s4.d3')::uuid);
-- 30.
select is((public.confirm_dose(current_setting('s4.d3')::uuid) ->> 'status'), 'cancelled',
  'a cancelled dose is not confirmable');
-- 31.
select is((select taken_at is null and cancelled_at is not null from public.dose_events
  where id = current_setting('s4.d3')::uuid), true,
  'a cancelled dose is unchanged by the attempt');

-- 32-38. A lapsed grace is settled as missed by the confirmation path itself.
select pg_temp.force_scheduled_at(current_setting('s4.d4')::uuid, now() - interval '2 hours');
-- 32.
select is((public.confirm_dose(current_setting('s4.d4')::uuid) ->> 'status'), 'missed',
  'a dose past its grace period confirms as missed');
-- 33.
select is(
  (select missed_at = scheduled_at + make_interval(mins => grace_minutes) from public.dose_events
   where id = current_setting('s4.d4')::uuid),
  true, 'the settled miss is stamped at scheduled_at plus grace');
-- 34.
select is((select taken_at from public.dose_events
  where id = current_setting('s4.d4')::uuid), null::timestamptz,
  'a missed dose never records a confirmation');
-- 35.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4.d4')::uuid and action = 'dose.missed'), 1::bigint,
  'settling the miss writes one dose.missed audit row');
-- 36.
select is((select count(*) from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d4')::uuid), 0::bigint,
  'a missed dose never touches stock');
-- 37.
select is((public.confirm_dose(current_setting('s4.d4')::uuid) ->> 'status'), 'missed',
  'a second attempt on a missed dose stays missed');
-- 38. Read as the manager.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.notifications
  where target_id = current_setting('s4.d4')::uuid and event_type = 'dose_missed'), 1::bigint,
  'a settled miss notifies the manager exactly once');

-- ===========================================================================
-- 39-45. Criterion 4: only the owning, active elder can confirm.
-- ===========================================================================

select pg_temp.force_scheduled_at(current_setting('s4.d_exact2')::uuid, now() - interval '2 minutes');

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 39.
select throws_ok(
  format('select public.confirm_dose(%L)', current_setting('s4.d_exact2')),
  '42501', null, 'the manager cannot confirm a dose');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 40.
select throws_ok(
  format('select public.confirm_dose(%L)', current_setting('s4.d_exact2')),
  '42501', null, 'an active family member cannot confirm a dose');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 41.
select throws_ok(
  format('select public.confirm_dose(%L)', current_setting('s4.d_exact2')),
  '42501', null, 'an unrelated account cannot confirm another elder''s dose');
-- 42. The same error as a nonexistent id: no existence leak.
select throws_ok(
  $$ select public.confirm_dose('00000000-0000-0000-0000-0000000000ff') $$,
  '42501', null, 'a nonexistent dose raises the same error as an unauthorized one');
-- 43.
select is((select count(*) from public.dose_events
  where id = current_setting('s4.d_exact2')::uuid and taken_at is not null), 0::bigint,
  'none of the rejected callers changed the dose');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 44.
select is((select count(*) from public.dose_events
  where id = current_setting('s4.d_exact2')::uuid and taken_at is null), 1::bigint,
  'the dose is still confirmable by its elder');

-- 45. anon has no execute at all.
select ok(
  not has_function_privilege('anon', 'public.confirm_dose(uuid, uuid)', 'execute'),
  'anon cannot execute confirm_dose');

-- ===========================================================================
-- 46-60. Criterion 5: the decrement is conditional and every failure reason is
-- recorded without touching stock.
-- ===========================================================================

select pg_temp.force_scheduled_at(current_setting('s4.d_unit')::uuid, now() - interval '1 minute');
-- 46.
select is((public.confirm_dose(current_setting('s4.d_unit')::uuid) ->> 'stock'), 'unit_mismatch',
  'a batch whose unit differs from the dose unit is not decremented');
-- 47.
select is((select count(*) from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d_unit')::uuid), 0::bigint,
  'a unit mismatch writes no inventory transaction');
-- 48.
select is((select quantity from public.medicine_batches where id = current_setting('s4.b_unit')::uuid),
  10::numeric, 'a unit mismatch leaves the batch quantity alone');

select pg_temp.force_scheduled_at(current_setting('s4.d_nobatch')::uuid, now() - interval '1 minute');
-- 49.
select is((public.confirm_dose(current_setting('s4.d_nobatch')::uuid) ->> 'stock'), 'no_batch',
  'a medicine with no batch reports no_batch');
-- 50.
select is((select count(*) from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d_nobatch')::uuid), 0::bigint,
  'no batch writes no inventory transaction');

select pg_temp.force_expired_batch(current_setting('s4.b_expired')::uuid);
select pg_temp.force_scheduled_at(current_setting('s4.d_expired')::uuid, now() - interval '1 minute');
-- 51.
select is((public.confirm_dose(current_setting('s4.d_expired')::uuid) ->> 'stock'), 'inactive_or_expired',
  'an expired active batch is never decremented');
-- 52.
select is((select count(*) from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d_expired')::uuid), 0::bigint,
  'an expired batch writes no inventory transaction');

select pg_temp.force_scheduled_at(current_setting('s4.d_short')::uuid, now() - interval '1 minute');
-- 53.
select is((public.confirm_dose(current_setting('s4.d_short')::uuid) ->> 'stock'), 'insufficient',
  'a batch smaller than the dose is not decremented');
-- 54.
select is((select quantity from public.medicine_batches where id = current_setting('s4.b_short')::uuid),
  0::numeric, 'an insufficient batch is left at zero, never negative');

select pg_temp.force_scheduled_at(current_setting('s4.d_exact')::uuid, now() - interval '1 minute');
-- 55.
select is((public.confirm_dose(current_setting('s4.d_exact')::uuid) ->> 'stock'), 'decremented',
  'a batch exactly equal to the dose is decremented');
-- 56.
select is((select quantity from public.medicine_batches where id = current_setting('s4.b_exact')::uuid),
  0::numeric, 'decrementing exactly the dose leaves zero');
-- 57.
select is((select count(*) from public.inventory_transactions
  where source_dose_event_id = current_setting('s4.d_exact')::uuid), 1::bigint,
  'the exact decrement writes its inventory transaction');
-- 58.
select is((select count(*) from public.medicine_batches where quantity < 0), 0::bigint,
  'no batch anywhere has a negative quantity');
-- 59.
select is((select after_summary ->> 'stock' from public.audit_events
  where target_id = current_setting('s4.d_unit')::uuid and action = 'dose.confirmed'),
  'unit_mismatch', 'the no-decrement reason is recorded on the audit row');
-- 60.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4.d_unit')::uuid and action = 'dose.confirmed'), 1::bigint,
  'a no-decrement confirmation is still audited exactly once');

-- ===========================================================================
-- 61-67. Criterion 7: the missed transition is server-only, idempotent and
-- notifies once.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select pg_temp.force_scheduled_at(current_setting('s4.d_last1')::uuid, now() - interval '3 hours');

-- 61. A client role is refused even though the function exists.
select throws_ok(
  $$ select public.transition_missed_doses() $$,
  '42501', null, 'authenticated cannot execute the missed transition');
-- 62.
select ok(
  not has_function_privilege('anon', 'public.transition_missed_doses()', 'execute'),
  'anon cannot execute the missed transition');
-- 63.
select ok(
  has_function_privilege('authenticated', 'public.confirm_dose(uuid, uuid)', 'execute'),
  'authenticated can execute confirm_dose');

-- The job runs as the owner. `reset role` + the direct call is exactly what
-- pg_cron does; no client role is ever granted the function.
reset role;
select set_config('s4.missed_count', public.transition_missed_doses()::text, true);
set local role authenticated;

-- 64.
select is((select missed_at is not null from public.dose_events
  where id = current_setting('s4.d_last1')::uuid), true,
  'the transition settles a lapsed dose as missed');
-- 65.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4.d_last1')::uuid and action = 'dose.missed'), 1::bigint,
  'the transition writes one audit row per event');
-- 66.
select is((select count(*) from public.notifications
  where target_id = current_setting('s4.d_last1')::uuid and event_type = 'dose_missed'), 1::bigint,
  'the transition notifies the manager exactly once');

reset role;
select set_config('s4.missed_second', public.transition_missed_doses()::text, true);
set local role authenticated;

-- 67.
select is(
  (select count(*) from public.audit_events
    where target_id = current_setting('s4.d_last1')::uuid and action = 'dose.missed'),
  1::bigint, 'a second transition run is a no-op for an already-missed dose');

-- ===========================================================================
-- 68-77. Criterion 8 (continued): notifications are recipient-only, the ledgers
-- are read-only to every client, and a family member reads the full plan.
-- ===========================================================================

-- A notification for the other circle, so cross-recipient marking is testable.
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config('s4.d_e2',
  (select id::text from public.dose_events
   where medication_id = current_setting('s4.m3')::uuid and taken_at is null
   order by scheduled_at, id limit 1), true);
select pg_temp.force_scheduled_at(current_setting('s4.d_e2')::uuid, now() - interval '1 minute');
select public.confirm_dose(current_setting('s4.d_e2')::uuid);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 68.
select ok((select count(*) from public.notifications) >= 2,
  'the manager reads their own notifications');
-- 69.
select is((select count(*) from public.notifications
  where recipient_id <> '11111111-1111-1111-1111-111111111111'::uuid), 0::bigint,
  'the manager cannot read another recipient''s notification');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 70.
select is((select count(*) from public.notifications), 0::bigint,
  'the elder reads no notification row');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 71. Full plan visibility: the family member reads the plan tables too.
select ok(
  (select count(*) from public.medications) = 9
  and (select count(*) from public.medication_schedules) = 9
  and (select count(*) from public.medicine_batches) = 7,
  'an active family member reads the linked elder''s full plan read-only');
-- 72.
select ok((select count(*) from public.inventory_transactions) >= 2,
  'an active family member reads the elder''s stock ledger');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 73.
select is((select count(*) from public.inventory_transactions), 0::bigint,
  'an unrelated account reads no stock ledger row');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 74.
select throws_ok(
  $$ update public.dose_events set taken_at = now() $$,
  '42501', null, 'a family member cannot update an occurrence');
-- 75.
select throws_ok(
  $$ update public.inventory_transactions set delta = 0 $$,
  '42501', null, 'a family member cannot update the stock ledger');
-- 76.
select throws_ok(
  $$ update public.notifications set read_at = now() $$,
  '42501', null, 'a family member cannot update a notification');

-- Capture another recipient's notification id as that recipient, because RLS
-- hides it from everyone else.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s4.other_notification',
  (select id::text from public.notifications
   where recipient_id = '66666666-6666-6666-6666-666666666666'::uuid limit 1), true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 77. Marking someone else's notification is a silent no-op.
select is(public.mark_notifications_read(array[current_setting('s4.other_notification')::uuid]), 0,
  'a recipient can mark only their own notifications read');

-- ===========================================================================
-- 78-87. Criterion 9: the three tables are RPC-only and the anchors hold.
-- ===========================================================================

-- 78.
select throws_ok(
  $$ insert into public.dose_events (schedule_id, elder_id, medication_id, scheduled_at,
       scheduled_local_date, dose_quantity, dose_unit, grace_minutes, timezone)
     values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-000000000003', now(), current_date, 1, 'tablet', 30, 'UTC') $$,
  '42501', null, 'a direct insert into dose_events is denied');
-- 79.
select throws_ok(
  $$ insert into public.inventory_transactions (batch_id, delta, reason)
     values ('00000000-0000-0000-0000-000000000001', 1, 'dose_confirmed') $$,
  '42501', null, 'a direct insert into inventory_transactions is denied');
-- 80.
select throws_ok(
  $$ insert into public.notifications (recipient_id, event_type)
     values ('00000000-0000-0000-0000-000000000001', 'dose_confirmed') $$,
  '42501', null, 'a direct insert into notifications is denied');
-- 81.
select throws_ok(
  $$ update public.dose_events set dose_quantity = 99 $$,
  '42501', null, 'a direct update of dose_events is denied');

reset role;
-- 82.
select throws_ok(
  $$ update public.inventory_transactions set delta = 1 $$,
  '42501', null, 'the stock ledger is append-only');
-- 83.
select throws_ok(
  $$ delete from public.inventory_transactions $$,
  '42501', null, 'the stock ledger cannot be deleted from');
-- 84.
select ok(
  exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'dose_events_occurrence_key' and i.indisunique),
  'the (schedule_id, scheduled_at) occurrence key is unique');
-- 85.
select ok(
  exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'inventory_transactions_dose_decrement_key'
      and i.indisunique and i.indpred is not null),
  'at most one automatic decrement per dose is enforced by a partial unique index');
-- 86.
select ok(
  exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'notifications_event_key' and i.indisunique),
  'one notification per event per recipient is enforced by a unique index');
-- 87.
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where relname in ('dose_events', 'inventory_transactions', 'notifications')),
  'all three new tables have RLS enabled');
set local role authenticated;

-- ===========================================================================
-- 88-92. Sprint 3 hand-off: a plan edit affects future occurrences only.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- Force one occurrence into the future, then move the schedule's time.
select set_config('s4.recon_target',
  (select id::text from public.dose_events
   where schedule_id = current_setting('s4.s_recon')::uuid
     and taken_at is null and missed_at is null and cancelled_at is null
   order by scheduled_at, id limit 1), true);
select pg_temp.force_scheduled_at(current_setting('s4.recon_target')::uuid, now() + interval '1 hour');

select public.update_schedule(
  current_setting('s4.s_recon')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '06:30',
  'UTC', 25);

-- 88.
select is((select cancelled_at is not null from public.dose_events
  where id = current_setting('s4.recon_target')::uuid), true,
  'a schedule time change cancels a future occurrence that no longer matches');
-- 89. The invariant that remains: nothing non-cancelled survives that the plan
--     does not produce.
select is((select count(*) from public.dose_events d
  join public.medication_schedules s on s.id = d.schedule_id
  where d.schedule_id = current_setting('s4.s_recon')::uuid
    and d.taken_at is null and d.missed_at is null and d.cancelled_at is null
    and d.scheduled_at > now()
    and not (
      extract(dow from d.scheduled_local_date)::smallint = any (s.days_of_week)
      and d.scheduled_at = (d.scheduled_local_date + s.time_of_day) at time zone s.timezone
    )), 0::bigint,
  'no surviving future occurrence contradicts its schedule after an edit');

-- 90-91. A medicine edit refreshes the snapshot of the genuine future slot.
select set_config('s4.recon_keep',
  (select id::text from public.dose_events
   where schedule_id = current_setting('s4.s_recon')::uuid
     and taken_at is null and missed_at is null and cancelled_at is null
     and scheduled_at > now()
   order by scheduled_at, id limit 1), true);
select public.update_medication(
  current_setting('s4.m_recon')::uuid, 'Recon', '5 mg', 'tablet', 2, 'tablet',
  'Take one tablet each morning', '2026-01-01', null);
-- 90.
select is((select dose_quantity from public.dose_events
  where id = current_setting('s4.recon_keep')::uuid), 2::numeric,
  'a dose edit refreshes the snapshot on a future occurrence');
-- 91.
select is((select grace_minutes from public.dose_events
  where id = current_setting('s4.recon_keep')::uuid), 25::smallint,
  'a grace edit refreshes the snapshot on a future occurrence');

-- 92. Deactivating the medicine cancels what is left in the future.
select pg_temp.force_scheduled_at(current_setting('s4.recon_keep')::uuid, now() + interval '3 hours');
select public.set_medication_active(current_setting('s4.m_recon')::uuid, false);
select is((select cancelled_at is not null from public.dose_events
  where id = current_setting('s4.recon_keep')::uuid), true,
  'deactivating a medicine cancels its future occurrences');

-- ===========================================================================
-- 93-96. Criterion 10: with no manager the confirmation still stands.
-- ===========================================================================

select pg_temp.force_scheduled_at(current_setting('s4.d_last2')::uuid, now() - interval '1 minute');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.revoke_care_link(current_setting('s4.link_a')::uuid, 'test: no manager');
-- 93.
select is((public.confirm_dose(current_setting('s4.d_last2')::uuid) ->> 'status'), 'taken',
  'a confirmation succeeds with no active manager');
-- 94.
select is((select quantity from public.medicine_batches where id = current_setting('s4.b_last')::uuid),
  9::numeric, 'stock is still decremented with no manager');
-- 95.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4.d_last2')::uuid and action = 'dose.confirmed'), 1::bigint,
  'the audit row is still written with no manager');
-- 96. Read as the manager: notifications are recipient-only, and the manager
--     keeps access to their own rows even after the care link is revoked.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select is((select count(*) from public.notifications
  where target_id = current_setting('s4.d_last2')::uuid), 0::bigint,
  'a manager-less circle simply writes no notification');

-- ===========================================================================
-- 97. A deactivated account cannot confirm through a still-valid JWT.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
reset role;
select pg_temp.deactivate_profile('22222222-2222-2222-2222-222222222222');
set local role authenticated;
-- 97.
select throws_ok(
  format('select public.confirm_dose(%L)', current_setting('s4.d_last2')),
  '42501', null, 'a deactivated elder cannot confirm');

-- ===========================================================================
-- 98-101. Structure.
-- ===========================================================================

reset role;
-- 98. Every foreign key on the two new fact tables restricts deletion.
select ok(
  (select bool_and(confdeltype = 'r') from pg_constraint
   where contype = 'f'
     and conrelid in ('public.dose_events'::regclass, 'public.inventory_transactions'::regclass)),
  'the new foreign keys restrict deletion');
-- 99. The decision is one conditional update, never a client-side check.
select ok(
  pg_get_functiondef('public.confirm_dose(uuid, uuid)'::regprocedure) like '%taken_at is null%'
  and pg_get_functiondef('public.confirm_dose(uuid, uuid)'::regprocedure)
        like '%quantity >= v_row.dose_quantity%',
  'confirm_dose carries the confirmation and decrement predicates itself');
-- 100.
select ok(
  (select count(*) from pg_trigger
   where tgname in ('medication_schedules_reconcile_dose_events',
                    'medications_reconcile_dose_events')) = 2,
  'both reconcile triggers exist');
-- 101. The job is scheduled whenever pg_cron is available; if it is not, the
--      spec's documented fallback applies and this assertion still holds.
select ok(
  (select count(*) from pg_extension where extname = 'pg_cron') = 0
  or exists (select 1 from cron.job where jobname = 'transition-missed-doses'),
  'the missed-dose job is scheduled whenever pg_cron is available');

select * from finish();
rollback;
