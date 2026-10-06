-- Sprint 4b invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-4b-dose-reactivation.md as database tests: reactivating a medicine
-- restores the future occurrences a deactivation cancelled, without ever resurrecting a
-- taken/missed/schedule-changed row, without duplicating an occurrence after a schedule
-- change, and without overriding Sprint 5's batch suppression. The reopen is proven
-- through the public RPCs (set_medication_active) and the reconcile trigger path.
--
-- Same single-session convention as Sprints 2-7: serialised equivalents, not true
-- concurrency. Facts the product never sets from a client are forced as the definer.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(20);

-- JWT claims helper (same as Sprints 1-7).
create function pg_temp.set_claims(p_sub text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_sub)::text,
    true
  );
end;
$$;

create function pg_temp.reconcile(p_med uuid)
returns integer language sql security definer set search_path = public, pg_temp
as $$ select public.reconcile_dose_events_for_medication(p_med); $$;

create function pg_temp.suppresses(p_med uuid)
returns boolean language sql security definer set search_path = public, pg_temp
as $$ select public.medicine_suppresses_doses(p_med); $$;

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

-- A confirm fact: exactly what confirm_dose would stamp on a taken occurrence.
create function pg_temp.mark_taken(p_id uuid, p_actor uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$
  update public.dose_events
     set taken_at = now(), confirmed_by = p_actor, cancelled_at = null, cancel_reason = null
   where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures. c1 manages e1. Four medicines, each with a valid active batch and an
-- all-week 08:00 Asia/Singapore schedule, activated so each generates a four-day
-- window (today .. today+3).
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
   '{"role":"elder","full_name":"Elder One"}', now(), now());

set local role authenticated;

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s4b.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's4b.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s4b.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

select set_config('s4b.m_r', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Reactivate', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4b.m_s', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'ScheduleShift', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4b.m_t', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Exceptions', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s4b.m_sup', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'SuppressedReactivate', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);

select set_config('s4b.b_r', public.create_batch(
  current_setting('s4b.m_r')::uuid, 30, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4b.b_s', public.create_batch(
  current_setting('s4b.m_s')::uuid, 30, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4b.b_t', public.create_batch(
  current_setting('s4b.m_t')::uuid, 30, 'tablet', null, '2027-12-31', null, null, true)::text, true);
select set_config('s4b.b_sup', public.create_batch(
  current_setting('s4b.m_sup')::uuid, 30, 'tablet', null, '2027-12-31', null, null, true)::text, true);

select set_config('s4b.s_r', public.create_schedule(
  current_setting('s4b.m_r')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4b.s_s', public.create_schedule(
  current_setting('s4b.m_s')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4b.s_t', public.create_schedule(
  current_setting('s4b.m_t')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);
select set_config('s4b.s_sup', public.create_schedule(
  current_setting('s4b.m_sup')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);

select public.set_medication_active(current_setting('s4b.m_r')::uuid, true);
select public.set_medication_active(current_setting('s4b.m_s')::uuid, true);
select public.set_medication_active(current_setting('s4b.m_t')::uuid, true);
select public.set_medication_active(current_setting('s4b.m_sup')::uuid, true);

-- Capture the open future window for each medicine before any lifecycle change.
select set_config('s4b.fut_r', (
  select count(*)::text from public.dose_events
  where medication_id = current_setting('s4b.m_r')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null
), true);
select set_config('s4b.fut_t', (
  select count(*)::text from public.dose_events
  where medication_id = current_setting('s4b.m_t')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null
), true);
select set_config('s4b.fut_sup', (
  select count(*)::text from public.dose_events
  where medication_id = current_setting('s4b.m_sup')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null
), true);

-- ===========================================================================
-- 1-9. Straight deactivate -> reactivate restores the window.
-- ===========================================================================

-- 1.
select ok(current_setting('s4b.fut_r')::int >= 1,
  'an active plan with a valid batch generates an open future window');

select public.set_medication_active(current_setting('s4b.m_r')::uuid, false);

-- 2. Deactivation writes one audit row.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4b.m_r')::uuid
    and action = 'medication.deactivated'), 1::bigint,
  'deactivation writes exactly one medication.deactivated audit row');
-- 3.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_r')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  0::bigint, 'deactivation closes the future window');
-- 4.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_r')::uuid
    and scheduled_at > now() and cancel_reason = 'plan_deactivated'),
  current_setting('s4b.fut_r')::bigint,
  'every closed occurrence carries plan_deactivated');

-- The fixture activation already wrote one medication.reactivated row; capture the baseline.
select set_config('s4b.react_before', (
  select count(*)::text from public.audit_events
  where target_id = current_setting('s4b.m_r')::uuid and action = 'medication.reactivated'
), true);

select public.set_medication_active(current_setting('s4b.m_r')::uuid, true);

-- 5.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_r')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  current_setting('s4b.fut_r')::bigint,
  'reactivation reopens exactly the future window a deactivation closed');
-- 6.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_r')::uuid and cancel_reason = 'plan_deactivated'),
  0::bigint, 'no plan_deactivated reason survives a reactivation');
-- 7.
select is(pg_temp.reconcile(current_setting('s4b.m_r')::uuid), 0,
  'a repeated reconcile after reactivation creates nothing');
-- 8.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4b.m_r')::uuid
    and action = 'medication.reactivated'), current_setting('s4b.react_before')::bigint + 1,
  'reactivation writes exactly one medication.reactivated audit row');

select public.set_medication_active(current_setting('s4b.m_r')::uuid, true);

-- 9.
select is((select count(*) from public.audit_events
  where target_id = current_setting('s4b.m_r')::uuid
    and action = 'medication.reactivated'), current_setting('s4b.react_before')::bigint + 1,
  'a repeat reactivation is a no-op with no new audit row');

-- ===========================================================================
-- 10-13. A schedule change while inactive: stale stays, fresh appears, no dupes.
-- ===========================================================================

select public.set_medication_active(current_setting('s4b.m_s')::uuid, false);

-- 10.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_s')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  0::bigint, 'the schedule-change fixture starts closed');

-- Change the wall-clock while the plan is inactive; the old occurrences no longer match.
select public.update_schedule(
  current_setting('s4b.s_s')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '20:00',
  'Asia/Singapore', 30);

select public.set_medication_active(current_setting('s4b.m_s')::uuid, true);

-- 11.
select ok((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_s')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null) >= 1,
  'reactivation after a schedule change produces fresh open occurrences');
-- 12.
select ok((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_s')::uuid and cancel_reason = 'plan_deactivated') >= 1,
  'an occurrence that no longer matches the schedule stays cancelled');
-- 13.
select is(
  (select count(*) from (
     select distinct schedule_id, scheduled_at from public.dose_events
     where medication_id = current_setting('s4b.m_s')::uuid) d),
  (select count(*) from public.dose_events
   where medication_id = current_setting('s4b.m_s')::uuid),
  'no (schedule_id, scheduled_at) occurrence is duplicated after a schedule change');

-- ===========================================================================
-- 14-16. Reopen never touches a taken row, and never a schedule_changed row.
-- ===========================================================================

-- Take one future occurrence before deactivation: it must survive untouched.
select set_config('s4b.taken_row', (
  select id::text from public.dose_events
  where medication_id = current_setting('s4b.m_t')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null
  order by scheduled_at, id limit 1
), true);
select pg_temp.mark_taken(
  current_setting('s4b.taken_row')::uuid, '11111111-1111-1111-1111-111111111111');

select public.set_medication_active(current_setting('s4b.m_t')::uuid, false);

-- Force one of the freshly-closed rows to look like a schedule cancellation.
select set_config('s4b.sched_row', (
  select id::text from public.dose_events
  where medication_id = current_setting('s4b.m_t')::uuid
    and scheduled_at > now() and cancel_reason = 'plan_deactivated'
  order by scheduled_at, id limit 1
), true);
select pg_temp.force_cancel_reason(current_setting('s4b.sched_row')::uuid, 'schedule_changed');

select public.set_medication_active(current_setting('s4b.m_t')::uuid, true);

-- 14.
select is((select taken_at is not null and cancelled_at is null
  from public.dose_events where id = current_setting('s4b.taken_row')::uuid), true,
  'a taken occurrence is never reopened or cancelled by the lifecycle');
-- 15.
select is((select cancelled_at is not null and cancel_reason = 'schedule_changed'
  from public.dose_events where id = current_setting('s4b.sched_row')::uuid), true,
  'a schedule_changed cancellation is never reopened by a reactivation');
-- 16. future_before included the row that later became taken, so two are missing now:
--     the taken row (excluded from an "open" count) and the schedule_changed row.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_t')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  current_setting('s4b.fut_t')::bigint - 2,
  'only the taken and schedule_changed occurrences stay closed after reactivation');

-- ===========================================================================
-- 17-20. Suppression wins over reactivation; a valid batch then resumes.
-- ===========================================================================

select public.set_medication_active(current_setting('s4b.m_sup')::uuid, false);

-- 17.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_sup')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  0::bigint, 'the suppressed-reactivating fixture starts closed');

-- Expire the only batch while the plan is inactive, then reactivate.
select pg_temp.force_expired_batch(current_setting('s4b.b_sup')::uuid);
select public.set_medication_active(current_setting('s4b.m_sup')::uuid, true);

-- 18.
select is(pg_temp.suppresses(current_setting('s4b.m_sup')::uuid), true,
  'an expired active batch still suppresses after reactivation');
-- 19.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_sup')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  0::bigint, 'reactivating a suppressed medicine does not restore its future window');

-- Replace the invalid batch with a valid one: the resume path now runs.
select public.deactivate_batch(current_setting('s4b.b_sup')::uuid);
select set_config('s4b.b_sup2', public.create_batch(
  current_setting('s4b.m_sup')::uuid, 10, 'tablet', null, '2027-12-31', null, null, true)::text, true);

-- 20.
select is((select count(*) from public.dose_events
  where medication_id = current_setting('s4b.m_sup')::uuid
    and scheduled_at > now() and taken_at is null and missed_at is null and cancelled_at is null),
  current_setting('s4b.fut_sup')::bigint,
  'a valid batch then resumes the plan_deactivated window');

select * from finish();
rollback;
