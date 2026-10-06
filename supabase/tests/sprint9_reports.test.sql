-- Sprint 9 invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-9.md as database tests: the read-only adherence report RPC
-- (authorization, bounds, aggregation, cancellation precedence, no leak, grants)
-- and the RLS regression the history screens depend on.
--
-- A real multi-day clock cannot be created in a single-session pgTAP harness, so
-- the report is driven by fixed local dates written through a definer helper, and
-- "missed" is only ever the persisted fact, never derived from the clock.
--
-- OD8 (approved 2026-10-06): the audit_events policy is left unchanged. It admits
-- the actor, the elder self and the manager, so the suite asserts the exact
-- boundary — the family member reads only rows they authored, the elder reads
-- their own elder-scoped rows, and the manager reads the care-plan trail.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(46);

-- JWT claims helper (same as Sprints 1-8).
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

-- Writes one controlled occurrence fact (a local date plus taken/missed/cancelled)
-- that the product only ever sets through guarded RPCs. The slot keeps
-- (schedule_id, scheduled_at) unique. Runs as the definer.
create function pg_temp.seed_dose(
  p_schedule uuid, p_elder uuid, p_med uuid, p_local_date date, p_slot int,
  p_taken boolean, p_missed boolean, p_cancelled boolean
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.dose_events (
    schedule_id, elder_id, medication_id, scheduled_at, scheduled_local_date,
    dose_quantity, dose_unit, grace_minutes, timezone,
    taken_at, confirmed_by, missed_at, cancelled_at
  ) values (
    p_schedule, p_elder, p_med,
    (p_local_date + (time '08:00' + (p_slot * interval '1 hour'))) at time zone 'Asia/Singapore',
    p_local_date, 1, 'tablet', 30, 'Asia/Singapore',
    case when p_taken then now() else null end,
    case when p_taken then p_elder else null end,
    case when p_missed then now() else null end,
    case when p_cancelled then now() else null end
  );
end;
$$;

create function pg_temp.deactivate_profile(p_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.profiles set deactivated_at = now() where id = p_id; $$;

-- An occurrence whose instant is deliberately on a different calendar day than its
-- stored local date, to prove the report buckets on `scheduled_local_date` and not
-- on the instant's day in the session zone (MF7 / criterion 6).
create function pg_temp.seed_dose_at(
  p_schedule uuid, p_elder uuid, p_med uuid, p_local_date date, p_at timestamptz,
  p_taken boolean
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.dose_events (
    schedule_id, elder_id, medication_id, scheduled_at, scheduled_local_date,
    dose_quantity, dose_unit, grace_minutes, timezone,
    taken_at, confirmed_by
  ) values (
    p_schedule, p_elder, p_med, p_at, p_local_date,
    1, 'tablet', 30, 'Asia/Singapore',
    case when p_taken then now() else null end,
    case when p_taken then p_elder else null end
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

-- The care circle, through the Sprint 1 RPCs only.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s9.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's9.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s9.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s9.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's9.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s9.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s9.link_f')::uuid);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s9.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's9.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s9.code_b')) ->> 'link_id', ''),
  true);

-- e1's plan: one draft medication and schedule (never activated), used only to
-- give the seeded occurrences valid foreign keys.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s9.m1', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Amlodipine', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);
select set_config('s9.s1', public.create_schedule(
  current_setting('s9.m1')::uuid, array[0, 1, 2, 3, 4, 5, 6]::smallint[], '08:00',
  'Asia/Singapore', 30)::text, true);

-- Fixed local-date facts for the report window 2026-06-01 .. 2026-06-05:
--   06-01 two taken | 06-02 one missed | 06-03 one open | 06-04 one taken + one
--   missed | 06-05 a cancelled+taken and a cancelled+missed (both excluded) |
--   05-30 one taken outside the window.
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-01', 0, true, false, false);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-01', 1, true, false, false);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-02', 0, false, true, false);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-03', 0, false, false, false);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-04', 0, true, false, false);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-04', 1, false, true, false);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-05', 0, true, false, true);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-05', 1, false, true, true);
select pg_temp.seed_dose(current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-05-30', 0, true, false, false);

-- ===========================================================================
-- 1-19. Aggregation on the fixed window, read as the manager. The report writes
-- nothing, so the audit count is captured immediately around the call.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s9.audit_before', (select count(*)::text from public.audit_events), true);
select set_config('s9.rep', public.get_adherence_report(
  '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')::text, true);

-- 1.
select is((current_setting('s9.rep')::jsonb -> 'totals' ->> 'taken')::int, 3,
  'the report totals the taken facts');
-- 2.
select is((current_setting('s9.rep')::jsonb -> 'totals' ->> 'missed')::int, 2,
  'the report totals the persisted missed facts');
-- 3.
select is((current_setting('s9.rep')::jsonb -> 'totals' ->> 'open')::int, 1,
  'the report counts an unsettled occurrence as open');
-- 4.
select is((current_setting('s9.rep')::jsonb -> 'totals' ->> 'settled')::int, 5,
  'settled is taken plus missed');
-- 5.
select is((current_setting('s9.rep')::jsonb -> 'totals' ->> 'expected')::int, 6,
  'expected is settled plus open');
-- 6.
select is((current_setting('s9.rep')::jsonb -> 'totals' ->> 'percent')::int, 60,
  'the confirmation rate excludes open occurrences from the denominator');
-- 7.
select is(current_setting('s9.rep')::jsonb ->> 'from', '2026-06-01',
  'the report echoes the requested start date');
-- 8.
select is(current_setting('s9.rep')::jsonb ->> 'to', '2026-06-05',
  'the report echoes the requested end date');
-- 9.
select is(jsonb_array_length(current_setting('s9.rep')::jsonb -> 'days'), 5,
  'the day series is continuous across the range');
-- 10.
select is(current_setting('s9.rep')::jsonb -> 'days' -> 0 ->> 'date', '2026-06-01',
  'the first day carries its local date');
-- 11.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 0 ->> 'taken')::int, 2,
  'two occurrences on one day are both counted');
-- 12.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 0 ->> 'settled')::int, 2,
  'the first day is fully settled');
-- 13.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 2 ->> 'open')::int, 1,
  'a day with a single open occurrence reports open = 1');
-- 14.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 3 ->> 'taken')::int, 1,
  'a mixed day counts its taken occurrence');
-- 15.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 3 ->> 'missed')::int, 1,
  'a mixed day counts its missed occurrence');
-- 16.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 4 ->> 'taken')::int, 0,
  'a cancelled+taken occurrence is excluded');
-- 17.
select is((current_setting('s9.rep')::jsonb -> 'days' -> 4 ->> 'missed')::int, 0,
  'a cancelled+missed occurrence is excluded');
-- 18.
select is((
  select count(*) from jsonb_array_elements(current_setting('s9.rep')::jsonb -> 'days') d
  where d ->> 'date' = '2026-05-30'), 0::bigint,
  'a day outside the range is absent');
-- 19.
select is((public.get_adherence_report(
  '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-03')
  -> 'totals' ->> 'percent')::int, 67,
  'a non-integral rate is rounded (2 of 3 is 67)');

-- ===========================================================================
-- 20-23. The elder self and an active family member read the same summary.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 20.
select lives_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')
  $$, 'the elder reads their own report');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config('s9.rep_family', public.get_adherence_report(
  '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')::text, true);
-- 21.
select is((current_setting('s9.rep_family')::jsonb -> 'totals' ->> 'taken')::int, 3,
  'an active family member reads the same totals');
-- 22.
select is((
  select array_agg(k order by k)
  from jsonb_object_keys(current_setting('s9.rep_family')::jsonb -> 'days' -> 0) k),
  array['date', 'expected', 'missed', 'open', 'settled', 'taken'],
  'a family member receives counts and dates only');
-- 23.
select is((
  select array_agg(k order by k)
  from jsonb_object_keys(current_setting('s9.rep_family')::jsonb) k),
  array['days', 'from', 'to', 'totals'],
  'the family payload has no id, medication or timestamp key');

-- ===========================================================================
-- 24-27. Authorization: only the elder or an active circle member may read, and
-- forbidden is indistinguishable from missing.
-- ===========================================================================

-- 24.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')
  $$, '42501', null, 'an unrelated account cannot read the report');
-- 25.
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')
  $$, '42501', null, 'a manager of another elder cannot read the report');
-- 26.
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')
  $$, '42501', null, 'an elder of another circle cannot read the report');
-- 27.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok($$
  select public.get_adherence_report(
    '99999999-9999-9999-9999-999999999999', date '2026-06-01', date '2026-06-05')
  $$, '42501', null, 'a nonexistent elder is indistinguishable from a forbidden one');

-- ===========================================================================
-- 28-31. Bounds: the range is 1..366 inclusive dates.
-- ===========================================================================

-- 28.
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', null, date '2026-06-05')
  $$, '23514', null, 'a missing start date is rejected');
-- 29.
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-06-05', date '2026-06-01')
  $$, '23514', null, 'a reversed range is rejected');
-- 30.
select lives_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-01-01', date '2027-01-01')
  $$, 'a 365-day difference (366 dates) is accepted');
-- 31.
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-01-01', date '2027-01-02')
  $$, '23514', null, 'a 366-day difference is rejected');

-- ===========================================================================
-- 32-33. Execute grants: authenticated only, by exact signature.
-- ===========================================================================

-- 32.
select is(has_function_privilege('anon',
  'public.get_adherence_report(uuid, date, date)', 'EXECUTE'), false,
  'the report is not anonymous-executable');
-- 33.
select is(has_function_privilege('authenticated',
  'public.get_adherence_report(uuid, date, date)', 'EXECUTE'), true,
  'the report is authenticated-executable');

-- ===========================================================================
-- 34-40. RLS regression and the OD8 audit boundary.
-- ===========================================================================

-- 34.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select ok((select count(*) from public.audit_events
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and actor_id <> '11111111-1111-1111-1111-111111111111') > 0,
  'the manager reads the elder care-plan audit trail');
-- 35.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.audit_events
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and actor_id <> '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'the family member reads no audit row written by another account (OD8 boundary)');
-- 36.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select ok((select count(*) from public.audit_events
  where elder_id = '22222222-2222-2222-2222-222222222222') > 0,
  'the elder reads their own elder-scoped audit rows (documented OD8 behaviour)');
-- 37.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select is((select count(*) from public.dose_events), 0::bigint,
  'an unrelated account reads no occurrence');
-- 38.
select throws_ok($$
  insert into public.dose_events (
    schedule_id, elder_id, medication_id, scheduled_at, scheduled_local_date,
    dose_quantity, dose_unit, grace_minutes, timezone)
  values (current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
          current_setting('s9.m1')::uuid, now(), current_date, 1, 'tablet', 30, 'Asia/Singapore')
  $$, '42501', null, 'an authenticated client cannot insert a dose event directly');

-- 39.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select is((select count(*)::text from public.audit_events), current_setting('s9.audit_before'),
  'reading the report writes no audit row');

-- ===========================================================================
-- 40-45. Bucket key, the PUBLIC grant, and the client write denials.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- A zone-crossing occurrence: its instant is 2026-06-09 in UTC, but its stored
-- local date is 2026-06-10, so the report must place it on 06-10.
select pg_temp.seed_dose_at(
  current_setting('s9.s1')::uuid, '22222222-2222-2222-2222-222222222222',
  current_setting('s9.m1')::uuid, date '2026-06-10',
  timestamptz '2026-06-09 20:00:00+00', true);
select set_config('s9.rep_zone', public.get_adherence_report(
  '22222222-2222-2222-2222-222222222222', date '2026-06-09', date '2026-06-10')::text, true);

-- 40.
select is((current_setting('s9.rep_zone')::jsonb -> 'days' -> 0 ->> 'taken')::int, 0,
  'a day with no rows is present with zeros');
-- 41.
select is((current_setting('s9.rep_zone')::jsonb -> 'days' -> 1 ->> 'taken')::int, 1,
  'the occurrence is bucketed by its stored local date, not its UTC instant');
-- 42. PUBLIC must carry no EXECUTE (the ACL has no grantee 0 entry).
select is(
  exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(p.proacl) a
    where p.proname = 'get_adherence_report'
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ), false, 'PUBLIC has no execute on the report');

-- 43.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select is((select count(*) from public.inventory_transactions), 0::bigint,
  'an unrelated account reads no stock ledger row');
-- 44.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok($$
  insert into public.inventory_transactions (batch_id, delta, reason)
  values (gen_random_uuid(), 1, 'dose_confirmed')
  $$, '42501', null, 'a client cannot insert a stock ledger row directly');
-- 45.
select throws_ok($$
  insert into public.audit_events (actor_id, action, target_table)
  values ('22222222-2222-2222-2222-222222222222', 'forged', 'audit_events')
  $$, '42501', null, 'a client cannot insert an audit row directly');

-- 46. Deactivation is checked as the whole boundary for a known circle member.
select pg_temp.deactivate_profile('33333333-3333-3333-3333-333333333333');
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select throws_ok($$
  select public.get_adherence_report(
    '22222222-2222-2222-2222-222222222222', date '2026-06-01', date '2026-06-05')
  $$, '42501', null, 'a deactivated caller is refused');

select * from finish();
rollback;
