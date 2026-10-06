-- Sprint 8 (Increment B) invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-8.md, Increment B. The help-request loop and the availability toggle are
-- exercised end to end: the elder creates, the circle is notified, the first active member
-- accepts, the elder or the accepter completes, the elder cancels, and every write outside a
-- guarded RPC is refused. Availability is per member and readable by the circle only.
--
-- Same single-session convention as Sprints 1-7; the circle is built through the Sprint 1 RPCs.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(26);

-- JWT claims helper (same as Sprints 1-7).
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
-- Fixtures: c1 manages e1; f1 is an active family member; f2 is invited (pending);
-- u1 is an unrelated elder.
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
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'f2@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"family_member","full_name":"Family Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'u1@example.test',
   extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"elder","full_name":"Unrelated One"}', now(), now());

set local role authenticated;

-- Caregiver link.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s8b.code_c', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's8b.link_c',
  coalesce(public.redeem_care_link_code(current_setting('s8b.code_c')) ->> 'link_id', ''),
  true);

-- Active family member.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s8b.code_f1', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's8b.link_f1',
  coalesce(public.redeem_care_link_code(current_setting('s8b.code_f1')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s8b.link_f1')::uuid);

-- Pending family member (never consented).
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s8b.code_f2', public.invite_family_member(), true);
select pg_temp.set_claims('44444444-4444-4444-4444-444444444444');
select set_config(
  's8b.link_f2',
  coalesce(public.redeem_care_link_code(current_setting('s8b.code_f2')) ->> 'link_id', ''),
  true);

-- ===========================================================================
-- 1-6. Creation: only the elder, validated, and readable by the circle.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's8b.req',
  public.create_help_request('urgent', 'Please pick up my prescription')::text,
  true);

-- 1. The elder raises a request.
select isnt(current_setting('s8b.req'), '', 'the elder creates a help request');

-- 2. The active family member reads it.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.help_requests
  where id = current_setting('s8b.req')::uuid), 1::bigint,
  'an active family member can read the request');

-- 3. An unrelated account cannot read it.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select is((select count(*) from public.help_requests
  where id = current_setting('s8b.req')::uuid), 0::bigint,
  'an unrelated account cannot read the request');

-- 4. A non-elder cannot create.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select public.create_help_request('urgent', null) $$,
  '42501', null, 'only the older adult can raise a help request');

-- 5. An unknown category is rejected.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ select public.create_help_request('chauffeuring', null) $$,
  '23514', null, 'an unknown help-request category is rejected');

-- 6. An over-long note is rejected.
select throws_ok(
  $$ select public.create_help_request('practical', repeat('x', 501)) $$,
  '23514', null, 'a note longer than 500 characters is rejected');

-- ===========================================================================
-- 7-8. Notifications: the circle is told, the actor is not.
-- ===========================================================================

-- 7. The active family member was notified.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select is((select count(*) from public.notifications
  where event_type = 'help_request_created'
    and target_id = current_setting('s8b.req')::uuid), 1::bigint,
  'an active family member is notified when help is requested');

-- 8. The elder who raised it is not notified of their own request.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.notifications
  where event_type = 'help_request_created'
    and target_id = current_setting('s8b.req')::uuid), 0::bigint,
  'the older adult is not notified of their own request');

-- ===========================================================================
-- 9-14. Accept and complete.
-- ===========================================================================

-- 9. An unrelated account cannot accept.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select throws_ok(
  $$ select public.accept_help_request(current_setting('s8b.req')::uuid) $$,
  '42501', null, 'a non-member cannot accept a help request');

-- 10. The first active member accepts.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select public.accept_help_request(current_setting('s8b.req')::uuid);
select is((select state from public.help_requests
  where id = current_setting('s8b.req')::uuid), 'accepted',
  'the accepting member claims the request');
select is((select accepted_by from public.help_requests
  where id = current_setting('s8b.req')::uuid), '33333333-3333-3333-3333-333333333333'::uuid,
  'the accepter is recorded');

-- 11. A second accept is refused.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select public.accept_help_request(current_setting('s8b.req')::uuid) $$,
  '23514', null, 'an already-answered request cannot be accepted again');

-- 12. A member who did not accept cannot complete it.
select throws_ok(
  $$ select public.complete_help_request(current_setting('s8b.req')::uuid) $$,
  '42501', null, 'only the elder or the accepter can complete a request');

-- 13. The accepter completes it.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select public.complete_help_request(current_setting('s8b.req')::uuid);
select is((select state from public.help_requests
  where id = current_setting('s8b.req')::uuid), 'completed',
  'the accepter marks the request completed');

-- 14. Completing again is refused.
select throws_ok(
  $$ select public.complete_help_request(current_setting('s8b.req')::uuid) $$,
  '23514', null, 'a completed request cannot be completed again');

-- ===========================================================================
-- 15-18. Cancel.
-- ===========================================================================

-- 15. A fresh request can be cancelled by the elder.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's8b.req2',
  public.create_help_request('companionship', null)::text,
  true);
select public.cancel_help_request(current_setting('s8b.req2')::uuid);
select is((select state from public.help_requests
  where id = current_setting('s8b.req2')::uuid), 'cancelled',
  'the older adult can cancel their request');

-- 16. A member cannot cancel.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select public.cancel_help_request(current_setting('s8b.req2')::uuid) $$,
  '42501', null, 'only the older adult can cancel a request');

-- 17. A cancelled request cannot be accepted.
select throws_ok(
  $$ select public.accept_help_request(current_setting('s8b.req2')::uuid) $$,
  '23514', null, 'a cancelled request cannot be accepted');

-- 18. A cancelled request cannot be cancelled again.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ select public.cancel_help_request(current_setting('s8b.req2')::uuid) $$,
  '23514', null, 'a closed request cannot be cancelled again');

-- ===========================================================================
-- 19-21. Availability.
-- ===========================================================================

-- 19. A member sets their own availability; the circle reads it.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select public.set_member_availability('22222222-2222-2222-2222-222222222222', false, 'Away this week');
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select is((select is_available from public.member_availability
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and member_id = '33333333-3333-3333-3333-333333333333'), false,
  'the caregiver reads the family member availability');
select is((select note from public.member_availability
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and member_id = '33333333-3333-3333-3333-333333333333'), 'Away this week',
  'the availability note is stored');

-- 20. A non-member cannot set availability.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select throws_ok(
  $$ select public.set_member_availability('22222222-2222-2222-2222-222222222222', true, null) $$,
  '42501', null, 'a non-member cannot set availability');

-- 21. An over-long availability note is rejected.
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select public.set_member_availability('22222222-2222-2222-2222-222222222222', true, repeat('x', 201)) $$,
  '23514', null, 'an availability note longer than 200 characters is rejected');

-- ===========================================================================
-- 22-24. No direct writes: the RPCs are the only client API.
-- ===========================================================================

-- 22. A direct insert is refused.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ insert into public.help_requests (elder_id, created_by, category)
     values ('22222222-2222-2222-2222-222222222222',
             '22222222-2222-2222-2222-222222222222', 'urgent') $$,
  '42501', null, 'a direct insert into help_requests is refused');

-- 23. A direct update is refused.
select throws_ok(
  $$ update public.help_requests set state = 'completed'
     where id = current_setting('s8b.req')::uuid $$,
  '42501', null, 'a direct update of help_requests is refused');

-- 24. A direct insert into availability is refused.
select throws_ok(
  $$ insert into public.member_availability (elder_id, member_id, is_available)
     values ('22222222-2222-2222-2222-222222222222',
             '22222222-2222-2222-2222-222222222222', true) $$,
  '42501', null, 'a direct insert into member_availability is refused');

select * from finish();
rollback;
