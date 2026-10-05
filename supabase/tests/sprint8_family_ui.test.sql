-- Sprint 8 (Increment A) invariants (pgTAP). Run with: npx supabase test db
--
-- docs/specs/sprint-8.md, Increment A. The family read-only views reuse the existing
-- RLS, except F-14 ("Family Care Circle"), which needs a co-member read of the elder's
-- active care_links. This file pins that new policy and proves the consent boundary:
-- an active member sees active co-members, a still-pending relative stays hidden from
-- co-members, the elder keeps their own view of a pending invite, and an unrelated
-- account sees nothing.
--
-- Same single-session convention as Sprints 1-7. The circle is built through the Sprint 1
-- RPCs only, with a real family consent, so the policy is exercised as the product uses it.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(8);

-- JWT claims helper (same as Sprints 1-7). The optional password age drives the
-- amr freshness the consent RPC re-checks.
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
-- Fixtures: c1 manages e1; f1 is an active family member; f2 is an invited family
-- member who has not been consented; u1 is an unrelated elder.
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

-- Caregiver link: c1 invites, e1 redeems (active).
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s8.code_c', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's8.link_c',
  coalesce(public.redeem_care_link_code(current_setting('s8.code_c')) ->> 'link_id', ''),
  true);

-- Active family member: c1 invites f1, f1 redeems, e1 consents.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s8.code_f1', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's8.link_f1',
  coalesce(public.redeem_care_link_code(current_setting('s8.code_f1')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s8.link_f1')::uuid);

-- Pending family member: c1 invites f2, f2 redeems, no consent.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s8.code_f2', public.invite_family_member(), true);
select pg_temp.set_claims('44444444-4444-4444-4444-444444444444');
select set_config(
  's8.link_f2',
  coalesce(public.redeem_care_link_code(current_setting('s8.code_f2')) ->> 'link_id', ''),
  true);

-- ===========================================================================
-- 1-4. The active family member's read of the circle.
-- ===========================================================================

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');

-- 1. The caregiver's active row is visible to the family member.
select is((select count(*) from public.care_links
  where elder_id = '22222222-2222-2222-2222-222222222222'
    and member_role = 'caregiver' and status = 'active'), 1::bigint,
  'an active family member can read the caregiver row in the circle');
-- 2. The active circle is exactly the caregiver plus the family member.
select is((select count(*) from public.care_links
  where elder_id = '22222222-2222-2222-2222-222222222222' and status = 'active'), 2::bigint,
  'an active family member sees both active members of the circle');
-- 3. The still-pending relative is hidden from the co-member.
select is((select count(*) from public.care_links
  where elder_id = '22222222-2222-2222-2222-222222222222' and status = 'invited'), 0::bigint,
  'a pending invite is hidden from a co-member');
-- 4. An unrelated account sees nothing of the circle.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select is((select count(*) from public.care_links
  where elder_id = '22222222-2222-2222-2222-222222222222'), 0::bigint,
  'an unrelated account cannot read another circle');

-- ===========================================================================
-- 5-6. The elder keeps their own view; the caregiver also sees the active circle.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 5. The elder still sees the pending relative (consent is theirs to give).
select is((select count(*) from public.care_links
  where elder_id = '22222222-2222-2222-2222-222222222222' and status = 'invited'), 1::bigint,
  'the elder still sees the pending invite in their circle');

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 6. The caregiver is an active member too, so the policy serves them as well.
select is((select count(*) from public.care_links
  where elder_id = '22222222-2222-2222-2222-222222222222' and status = 'active'), 2::bigint,
  'the caregiver also reads the active circle');

-- ===========================================================================
-- 7-8. Profile visibility follows the same consent boundary.
-- ===========================================================================

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 7. A co-member may see the elder's profile.
select is(public.can_view_profile('22222222-2222-2222-2222-222222222222'), true,
  'an active family member can see the elder profile');
-- 8. The pending relative's profile stays hidden until the elder consents.
select is(public.can_view_profile('44444444-4444-4444-4444-444444444444'), false,
  'a pending family member is not visible to a co-member');

select * from finish();
rollback;
