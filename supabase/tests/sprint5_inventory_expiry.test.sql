-- Sprint 5 invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-5.md as database tests: the owner's suppression rule (a batch
-- exists but no valid active batch remains) with its cancel/resume path, the
-- manual stock adjustment ledger and its authorization, the per-transition alert
-- sweep and its idempotency, the widened check constraints, and RLS scoping.
--
-- True concurrency (adjust_stock racing confirm_dose, two sweeps at once) and the
-- real pg_cron schedule cannot be created in a single-session pgTAP harness; as in
-- Sprints 2-4 the serialised equivalent is proven instead and the job's existence
-- is asserted separately. Values travel with set_config/current_setting.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(50);

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

-- Facts the product never sets from a client, forced as the definer.
create function pg_temp.force_expired_batch(p_batch_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$
  update public.medicine_batches
     set created_at = now() - interval '10 days',
         expiry_date = current_date - 5
   where id = p_batch_id;
$$;

create function pg_temp.force_cancel_reason(p_id uuid, p_reason text)
returns void language sql security definer set search_path = public, pg_temp
as $$
  update public.dose_events
     set cancelled_at = now(), cancel_reason = p_reason
   where id = p_id;
$$;

create function pg_temp.reconcile(p_med uuid)
returns integer language sql security definer set search_path = public, pg_temp
as $$ select public.reconcile_dose_events_for_medication(p_med); $$;

create function pg_temp.suppresses(p_med uuid)
returns boolean language sql security definer set search_path = public, pg_temp
as $$ select public.medicine_suppresses_doses(p_med); $$;

create function pg_temp.run_alerts()
returns integer language sql security definer set search_path = public, pg_temp
as $$ select public.check_inventory_alerts(); $$;

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

-- The care circle, through the Sprint 1 RPCs only.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s5.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's5.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s5.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s5.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's5.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s5.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s5.link_f')::uuid);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s5.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's5.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s5.code_b')) ->> 'link_id', ''),
  true);

-- ---------------------------------------------------------------------------
-- e1's plan, through the Sprint 3 RPCs. Batches are created BEFORE a medicine is
-- activated, so suppression is already in force when generation runs and the
-- counts are deterministic. Each active medicine carries an all-week schedule, so
-- a generating medicine produces today..today+3 = four occurrences.
--   m_ok       valid active tablet batch, qty 30 threshold 7
--   m_nobatch  no batch at all
--   m_short    valid active tablet batch, qty 0
--   m_unit     active capsule batch vs dose unit tablet (suppressed)
--   m_then     valid active batch, later forced expired then replaced
--   m_draft    an active batch but the medicine is never activated
-- ---------------------------------------------------------------------------

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

select set_config('s5.m_ok', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Amlodipine', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s5.m_nobatch', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Nobatch', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s5.m_short', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Short', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s5.m_unit', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Unitclash', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s5.m_then', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'ThenResume', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s5.m_draft', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Draft', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);

-- Batches are created BEFORE the schedule and before activation, so a suppressed
-- medicine never generates at all (not even a now-past occurrence for today).
select set_config('s5.b_ok', public.create_batch(
  current_setting('s5.m_ok')::uuid, 30, 'tablet', 'LOT-OK', '2027-12-31', 7, null, true)::text, true);
select set_config('s5.b_inactive', public.create_batch(
  current_setting('s5.m_ok')::uuid, 5, 'tablet', null, '2027-12-31', null, null, false)::text, true);
select set_config('s5.b_short', public.create_batch(
  current_setting('s5.m_short')::uuid, 0, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s5.b_unit', public.create_batch(
  current_setting('s5.m_unit')::uuid, 10, 'capsule', null, '2027-12-31', null, null, true)::text, true);
select set_config('s5.b_then', public.create_batch(
  current_setting('s5.m_then')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s5.b_draft', public.create_batch(
  current_setting('s5.m_draft')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);

select set_config('s5.s_ok', public.create_schedule(
  current_setting('s5.m_ok')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s5.s_nobatch', public.create_schedule(
  current_setting('s5.m_nobatch')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '09:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s5.s_short', public.create_schedule(
  current_setting('s5.m_short')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '10:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s5.s_unit', public.create_schedule(
  current_setting('s5.m_unit')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '11:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s5.s_then', public.create_schedule(
  current_setting('s5.m_then')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '12:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s5.s_draft', public.create_schedule(
  current_setting('s5.m_draft')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '13:00',
  'Asia/Singapore', 30)::text, true);

select public.set_medication_active(current_setting('s5.m_ok')::uuid, true);
select public.set_medication_active(current_setting('s5.m_nobatch')::uuid, true);
select public.set_medication_active(current_setting('s5.m_short')::uuid, true);
select public.set_medication_active(current_setting('s5.m_unit')::uuid, true);
select public.set_medication_active(current_setting('s5.m_then')::uuid, true);
-- m_draft is deliberately never activated.

-- e2's plan, for the cross-elder authorization test.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s5.m3', public.create_medication(
  '77777777-7777-7777-7777-777777777777', 'Aspirin', '100 mg', 'tablet', 1, 'tablet',
  'Take after dinner', '2026-01-01', null)::text, true);
select set_config('s5.s3', public.create_schedule(
  current_setting('s5.m3')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '20:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s5.b3', public.create_batch(
  current_setting('s5.m3')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select public.set_medication_active(current_setting('s5.m3')::uuid, true);

-- ===========================================================================
-- 1-6. Suppression: only a batch that exists but is invalid suppresses.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 1.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_ok')::uuid), 4::bigint,
  'a valid active batch generates the four-day window');
-- 2.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_nobatch')::uuid), 4::bigint,
  'a medicine with no batch keeps generating (batch stays optional)');
-- 3.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_short')::uuid), 4::bigint,
  'quantity zero warns but does not suppress');
-- 4.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_unit')::uuid), 0::bigint,
  'a unit-mismatched active batch suppresses generation');
-- 5.
select is(pg_temp.suppresses(current_setting('s5.m_unit')::uuid), true,
  'a batch exists but no valid active batch remains');
-- 6.
select is(pg_temp.suppresses(current_setting('s5.m_nobatch')::uuid), false,
  'no batch at all is not a suppression reason');

-- ===========================================================================
-- 7-16. Cancel and resume around a batch that expires then is replaced.
-- ===========================================================================

select set_config('s5.future_before', (
  select count(*)::text from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null
), true);

-- 7.
select is(pg_temp.suppresses(current_setting('s5.m_then')::uuid), false,
  'a valid active batch does not suppress');

select pg_temp.force_expired_batch(current_setting('s5.b_then')::uuid);

-- 8.
select is(pg_temp.suppresses(current_setting('s5.m_then')::uuid), true,
  'an expired active batch suppresses');
-- 9.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid
    and scheduled_at > now() and cancelled_at is not null and cancel_reason = 'batch_invalid'),
  current_setting('s5.future_before')::bigint,
  'expiring the batch cancels every future occurrence as batch_invalid');
-- 10.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid
    and scheduled_at > now() and cancelled_at is null), 0::bigint,
  'no future occurrence stays open while suppressed');

select public.deactivate_batch(current_setting('s5.b_then')::uuid);
select set_config('s5.b_then2', public.create_batch(
  current_setting('s5.m_then')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);

-- 11.
select is(pg_temp.suppresses(current_setting('s5.m_then')::uuid), false,
  'a replacement active batch lifts suppression');
-- 12.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid
    and scheduled_at > now() and cancelled_at is null),
  current_setting('s5.future_before')::bigint,
  'the replacement reopens exactly the batch_invalid occurrences');
-- 13.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid and cancel_reason = 'batch_invalid'),
  0::bigint, 'no batch_invalid reason survives the resume');
-- 14.
select is(pg_temp.reconcile(current_setting('s5.m_then')::uuid), 0,
  'a repeated resume is idempotent');

-- A schedule cancellation must never be reopened by a batch resume.
select set_config('s5.sched_row', (
  select id::text from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid
    and scheduled_at > now() and cancelled_at is null
  order by scheduled_at, id limit 1
), true);
select pg_temp.force_cancel_reason(current_setting('s5.sched_row')::uuid, 'schedule_changed');
select pg_temp.reconcile(current_setting('s5.m_then')::uuid);
-- 15.
select is((select cancelled_at is not null and cancel_reason = 'schedule_changed'
  from public.dose_events where id = current_setting('s5.sched_row')::uuid), true,
  'a schedule-changed cancellation stays cancelled across a batch resume');
-- 16.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s5.m_then')::uuid
    and scheduled_at > now() and cancelled_at is null),
  current_setting('s5.future_before')::bigint - 1,
  'only the schedule-changed occurrence is missing from the open set');

-- ===========================================================================
-- 17-32. Manual stock adjustment: ledger, audit, and every rejection.
-- ===========================================================================

-- 17.
select ok(public.adjust_stock(current_setting('s5.b_short')::uuid, 5, 'restock', 'restocked')
  is not null, 'a manager can restock an active batch');
-- 18.
select is((select count(*) from public.inventory_transactions
  where batch_id = current_setting('s5.b_short')::uuid
    and reason = 'manual_adjustment' and adjustment_reason = 'restock'
    and actor_id = '11111111-1111-1111-1111-111111111111' and note = 'restocked'), 1::bigint,
  'one signed ledger row records the reason, actor and note');
-- 19.
select is((select quantity from public.medicine_batches
  where id = current_setting('s5.b_short')::uuid), 5::numeric,
  'the adjustment moved the quantity');
-- 20.
select is((select count(*) from public.audit_events
  where action = 'inventory.adjusted' and target_table = 'medicine_batches'
    and target_id = current_setting('s5.b_short')::uuid), 1::bigint,
  'the adjustment writes exactly one audit row');

-- 21.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, 0, 'restock', null) $$,
  '23514', null, 'a zero adjustment is rejected');
-- 22.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, 5, 'bogus', null) $$,
  '23514', null, 'an unknown reason is rejected');
-- 23.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, -1000, 'correction', null) $$,
  '23514', null, 'a below-zero result is rejected, never clamped');
-- 24.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_inactive')::uuid, 5, 'restock', null) $$,
  '23514', null, 'an inactive batch cannot be adjusted');
-- 25.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_draft')::uuid, 5, 'restock', null) $$,
  '23514', null, 'an inactive medicine cannot be adjusted');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 26.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, 5, 'restock', null) $$,
  '42501', null, 'the elder cannot adjust stock');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 27.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, 5, 'restock', null) $$,
  '42501', null, 'a family member cannot adjust stock');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 28.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, 5, 'restock', null) $$,
  '42501', null, 'an unrelated account cannot adjust stock');

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
-- 29.
select throws_ok(
  $$ select public.adjust_stock(current_setting('s5.b_short')::uuid, 5, 'restock', null) $$,
  '42501', null, 'a manager of another elder cannot adjust stock');

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 30. Only the one successful adjustment above is in the ledger.
select is((select count(*) from public.inventory_transactions), 1::bigint,
  'no rejected call wrote a ledger row');
-- 31.
select throws_ok(
  $$ update public.inventory_transactions set delta = 1 $$,
  '42501', null, 'the ledger is append-only from the client');
-- 32.
select throws_ok(
  $$ select pg_temp.force_cancel_reason(current_setting('s5.sched_row')::uuid, 'bogus') $$,
  '23514', null, 'an unknown cancel reason is rejected');

-- ===========================================================================
-- 33-44. Alerts: grants, per-transition emission, idempotency, recipients.
-- ===========================================================================

-- 33.
select is(has_function_privilege('authenticated', 'public.check_inventory_alerts()', 'EXECUTE'),
  false, 'the alert sweep is not client-executable');
-- 34.
select is(has_function_privilege('anon', 'public.check_inventory_alerts()', 'EXECUTE'),
  false, 'the alert sweep is not anonymous-executable');
-- 35.
select is(has_function_privilege('authenticated', 'public.adjust_stock(uuid, numeric, text, text)',
  'EXECUTE'), true, 'adjust_stock is the one client API');
-- 36.
select is(has_function_privilege('authenticated', 'public.medicine_suppresses_doses(uuid)',
  'EXECUTE'), false, 'the suppression helper is internal');

-- The first sweep records the current states.
select pg_temp.run_alerts();
-- 37.
select is(pg_temp.run_alerts(), 0, 'a repeated sweep in the same state writes nothing');

-- b_ok is at quantity 30, threshold 7: normal. Drive low -> normal -> low.
select public.adjust_stock(current_setting('s5.b_ok')::uuid, -23, 'correction', null);
-- 38.
select is(pg_temp.run_alerts(), 1, 'a stock transition notifies once');
-- 39.
select is(pg_temp.run_alerts(), 0, 'the same state does not re-notify');
select public.adjust_stock(current_setting('s5.b_ok')::uuid, 10, 'restock', null);
-- 40.
select is(pg_temp.run_alerts(), 0, 'recovering to normal emits nothing');
select public.adjust_stock(current_setting('s5.b_ok')::uuid, -10, 'correction', null);
-- 41.
select is(pg_temp.run_alerts(), 1, 'a second low transition notifies again');
-- 42.
select is((select count(*) from public.notifications
  where event_type = 'stock_low' and target_id = current_setting('s5.m_ok')::uuid
    and recipient_id = '11111111-1111-1111-1111-111111111111'), 2::bigint,
  'low -> normal -> low produced two distinct alerts');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 43.
select is((select count(*) from public.notifications
  where event_type in ('stock_low', 'stock_out', 'stock_expiring', 'medicine_needs_review')), 0::bigint,
  'the elder receives no inventory-alert notification');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 44.
select is((select count(*) from public.notifications
  where event_type in ('stock_low', 'stock_out', 'stock_expiring', 'medicine_needs_review')), 0::bigint,
  'the family member receives no inventory-alert notification');

-- ===========================================================================
-- 45-50. RLS: the ledger is circle-scoped, notifications are recipient-only.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s5.ledger_total', (select count(*)::text from public.inventory_transactions), true);
-- 45.
select ok(current_setting('s5.ledger_total')::bigint > 0,
  'the manager reads the linked elder ledger');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 46.
select is((select count(*) from public.inventory_transactions),
  current_setting('s5.ledger_total')::bigint, 'the elder reads the same ledger');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 47.
select is((select count(*) from public.inventory_transactions),
  current_setting('s5.ledger_total')::bigint, 'the family member reads the same ledger');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 48.
select is((select count(*) from public.inventory_transactions), 0::bigint,
  'an unrelated account reads no ledger row');

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 49.
select is((select count(*) from public.notifications
  where recipient_id <> '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'notifications are recipient-only');
-- 50.
select throws_ok(
  $$ insert into public.notifications (recipient_id, elder_id, event_type, dedup_key)
     values ('11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222', 'dose_confirmed', 'x') $$,
  '42501', null, 'a client cannot write a notification directly');

select * from finish();
rollback;
