-- Sprint 10 invariants (pgTAP). Run with: npx supabase test db
--
-- Photo storage only: a caregiver attaches a prescription photo to a medicine, the care circle
-- reads it, and nobody but the manager may write. These tests cover the metadata table RLS, the
-- denied direct writes, both guarded RPCs and their authorization/validation, the audit rows, the
-- soft archive (the row is never deleted), the private bucket and its `storage.objects` policies.
--
-- The bucket candidate rows live in `storage.objects`, which Supabase owns and already protects
-- with RLS; the inserts below prove our added policies, not Supabase's defaults.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(42);

-- JWT claims helper (same as Sprints 1-9).
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

-- `storage.buckets` is invisible to `authenticated`, so the bucket assertions run as the definer.
create function pg_temp.bucket_is_public()
returns boolean language sql security definer set search_path = storage, public, pg_temp
as $$ select public from storage.buckets where id = 'prescription-images'; $$;

create function pg_temp.bucket_size_limit()
returns bigint language sql security definer set search_path = storage, public, pg_temp
as $$ select file_size_limit from storage.buckets where id = 'prescription-images'; $$;

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
select set_config('s10.code_a', public.create_elder_link_invite(), true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select set_config(
  's10.link_a',
  coalesce(public.redeem_care_link_code(current_setting('s10.code_a')) ->> 'link_id', ''),
  true);

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s10.code_f', public.invite_family_member(), true);
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
select set_config(
  's10.link_f',
  coalesce(public.redeem_care_link_code(current_setting('s10.code_f')) ->> 'link_id', ''),
  true);
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222', 0);
select public.consent_to_care_link(current_setting('s10.link_f')::uuid);

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
select set_config('s10.code_b', public.create_elder_link_invite(), true);
select pg_temp.set_claims('77777777-7777-7777-7777-777777777777');
select set_config(
  's10.link_b',
  coalesce(public.redeem_care_link_code(current_setting('s10.code_b')) ->> 'link_id', ''),
  true);

-- e1's medicine, through the Sprint 3 RPCs.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s10.m1', public.create_medication(
  '22222222-2222-2222-2222-222222222222', 'Amlodipine', '5 mg', 'tablet', 1, 'tablet',
  'Take one tablet each morning', '2026-01-01', null)::text, true);

-- ===========================================================================
-- 1-6. Reads are scoped to the care circle.
-- ===========================================================================

-- 1. Nothing stored yet.
select is((select count(*) from public.medication_images), 0::bigint,
  'the manager reads no photo before any is added');

-- Two photos registered by the manager.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select set_config('s10.img_a', public.register_medication_image(
  current_setting('s10.m1')::uuid,
  current_setting('s10.m1') || '/photo-a.jpg',
  'image/jpeg', 2048)::text, true);
select set_config('s10.img_b', public.register_medication_image(
  current_setting('s10.m1')::uuid,
  current_setting('s10.m1') || '/photo-b.png',
  'image/png', 4096)::text, true);

-- 2.
select is((select count(*) from public.medication_images), 2::bigint,
  'the manager reads both photos');
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 3.
select is((select count(*) from public.medication_images), 2::bigint,
  'the elder reads the same two photos');
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 4.
select is((select count(*) from public.medication_images), 2::bigint,
  'an active family member reads the two photos read-only');
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 5.
select is((select count(*) from public.medication_images), 0::bigint,
  'an unrelated account reads no photo');
select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
-- 6.
select is((select count(*) from public.medication_images), 0::bigint,
  'another caregiver reads no photo');

-- ===========================================================================
-- 7-9. Direct writes are denied; the RPCs are the only path.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');

-- 7.
select throws_ok(
  $$ insert into public.medication_images (medication_id, storage_path, mime_type, size_bytes, uploaded_by)
       values ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222/x.jpg',
               'image/jpeg', 10, '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'a direct insert into medication_images is denied');
-- 8.
select throws_ok($$ update public.medication_images set is_archived = true $$,
  '42501', null, 'a direct update to medication_images is denied');
-- 9.
select throws_ok($$ delete from public.medication_images $$,
  '42501', null, 'a direct delete from medication_images is denied');

-- ===========================================================================
-- 10-14. Only the linked manager may register a photo.
-- ===========================================================================

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 10.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.jpg', 'image/jpeg', 100) $$,
  '42501', null, 'the elder cannot add a prescription photo');

select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 11.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.jpg', 'image/jpeg', 100) $$,
  '42501', null, 'a family member cannot add a prescription photo');

select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 12.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.jpg', 'image/jpeg', 100) $$,
  '42501', null, 'an unrelated account cannot add a prescription photo');

select pg_temp.set_claims('66666666-6666-6666-6666-666666666666');
-- 13.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.jpg', 'image/jpeg', 100) $$,
  '42501', null, 'another caregiver cannot add a prescription photo to a foreign medicine');

-- 14.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select public.register_medication_image(
       '99999999-9999-9999-9999-999999999999',
       '99999999-9999-9999-9999-999999999999/x.jpg', 'image/jpeg', 100) $$,
  '42501', null, 'a photo cannot be attached to an unknown medicine');

-- ===========================================================================
-- 15-19. Registration validation.
-- ===========================================================================

-- 15.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.gif', 'image/gif', 100) $$,
  '23514', null, 'an unsupported image type is rejected');
-- 16.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.jpg', 'image/jpeg', 0) $$,
  '23514', null, 'a zero-byte image is rejected');
-- 17.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/x.jpg', 'image/jpeg', 10485761) $$,
  '23514', null, 'an image above 10 MB is rejected');
-- 18.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       'some-other-folder/x.jpg', 'image/jpeg', 100) $$,
  '23514', null, 'a path outside the medicine folder is rejected');
-- 19.
select throws_ok(
  $$ select public.register_medication_image(
       current_setting('s10.m1')::uuid,
       current_setting('s10.m1') || '/../x.jpg', 'image/jpeg', 100) $$,
  '23514', null, 'a path with traversal is rejected');

-- ===========================================================================
-- 20-22. The registered row.
-- ===========================================================================

-- 20.
select is(
  (select mime_type from public.medication_images where id = current_setting('s10.img_a')::uuid),
  'image/jpeg', 'the stored mime type is the one registered');
-- 21.
select is(
  (select size_bytes from public.medication_images where id = current_setting('s10.img_a')::uuid),
  2048::bigint, 'the stored size is the one registered');
-- 22.
select is(
  (select uploaded_by from public.medication_images where id = current_setting('s10.img_a')::uuid),
  '11111111-1111-1111-1111-111111111111'::uuid, 'the uploader is recorded');

-- ===========================================================================
-- 23-24. Audit rows.
-- ===========================================================================

-- 23.
select is(
  (select count(*) from public.audit_events where action = 'medication_image.added'),
  2::bigint, 'each registration writes one audit row');
-- 24.
select is(
  (select count(*) from public.audit_events
     where action = 'medication_image.added' and target_table = 'medication_images'),
  2::bigint, 'the audit row names the medication_images table');

-- ===========================================================================
-- 25-32. Archive is soft and manager-only; nothing is ever deleted.
-- ===========================================================================

-- 25.
select public.archive_medication_image(current_setting('s10.img_a')::uuid);
select is(
  (select is_archived from public.medication_images where id = current_setting('s10.img_a')::uuid),
  true, 'archiving marks the row archived');
-- 26.
select isnt(
  (select archived_at from public.medication_images where id = current_setting('s10.img_a')::uuid),
  null::timestamptz, 'archiving stamps the time');
-- 27.
select is(
  (select archived_by from public.medication_images where id = current_setting('s10.img_a')::uuid),
  '11111111-1111-1111-1111-111111111111'::uuid, 'archiving records the actor');
-- 28.
select is(
  (select count(*) from public.audit_events where action = 'medication_image.archived'),
  1::bigint, 'archiving writes one audit row');
-- 29. A second archive is a no-op: no new audit row.
select public.archive_medication_image(current_setting('s10.img_a')::uuid);
select is(
  (select count(*) from public.audit_events where action = 'medication_image.archived'),
  1::bigint, 'a repeated archive writes no second audit row');

select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
-- 30.
select throws_ok(
  $$ select public.archive_medication_image(current_setting('s10.img_b')::uuid) $$,
  '42501', null, 'the elder cannot archive a prescription photo');
-- 31.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select public.archive_medication_image('99999999-9999-9999-9999-999999999999') $$,
  '42501', null, 'an unknown photo id is refused');
-- 32.
select is(
  (select count(*) from public.medication_images
     where id = current_setting('s10.img_a')::uuid),
  1::bigint, 'an archived photo row is kept');

-- ===========================================================================
-- 33-41. Storage: a private bucket with care-circle policies.
-- ===========================================================================

-- 33.
select is(pg_temp.bucket_is_public(), false, 'the prescription-images bucket is private');
-- 34.
select is(pg_temp.bucket_size_limit(), 10485760::bigint, 'the bucket caps uploads at 10 MB');

-- 35. The manager can upload into their medicine's folder.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
       values ('prescription-images', current_setting('s10.m1') || '/object-a.jpg') $$,
  'the manager can upload a photo into the medicine folder');

-- 36.
select pg_temp.set_claims('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
       values ('prescription-images', current_setting('s10.m1') || '/object-b.jpg') $$,
  '42501', null, 'the elder cannot upload a photo');
-- 37.
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
       values ('prescription-images', current_setting('s10.m1') || '/object-c.jpg') $$,
  '42501', null, 'an unrelated account cannot upload a photo');
-- 38.
select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
       values ('prescription-images', '99999999-9999-9999-9999-999999999999/object-d.jpg') $$,
  '42501', null, 'an object cannot be uploaded under an unknown medicine folder');

-- 39.
select is(
  (select count(*) from storage.objects where bucket_id = 'prescription-images'),
  1::bigint, 'the manager reads the uploaded object');
select pg_temp.set_claims('33333333-3333-3333-3333-333333333333');
-- 40.
select is(
  (select count(*) from storage.objects where bucket_id = 'prescription-images'),
  1::bigint, 'an active family member reads the uploaded object');
select pg_temp.set_claims('55555555-5555-5555-5555-555555555555');
-- 41.
select is(
  (select count(*) from storage.objects where bucket_id = 'prescription-images'),
  0::bigint, 'an unrelated account reads no object');

-- ===========================================================================
-- 42. The path helper rejects anything that is not <medication_id>/<file>.
-- ===========================================================================

select pg_temp.set_claims('11111111-1111-1111-1111-111111111111');
-- 42.
select is(
  public.medication_image_elder_from_path('not-a-uuid/photo.jpg'),
  null::uuid, 'a malformed object name resolves to no elder');

select * from finish();
rollback;
