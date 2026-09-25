-- Seed data for local development.
--
-- SYNTHETIC FIXTURES ONLY. Never put real elder or caregiver data here — real
-- health data must not enter dev, tests, or any AI tool
-- (docs/01-dev-environment.md section 1.8).
--
-- Sprint 1 fixtures: one caregiver, one elder and one connected family member,
-- with the two links the RPCs would otherwise create. Fixed UUIDs so tests and
-- the app can refer to them. The handle_new_user trigger creates the profiles.
--
-- Auth identities are intentionally not seeded here; the app is still on SQLite
-- until Sprint 1b, which adds the login rows when it wires up Supabase Auth.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'maria@eldercare.test',
    extensions.crypt('demo1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"caregiver","full_name":"Maria Santos"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'ana@eldercare.test',
    extensions.crypt('demo1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"elder","full_name":"Ana Reyes"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'leo@eldercare.test',
    extensions.crypt('demo1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"family_member","full_name":"Leo Reyes"}',
    now(), now()
  );

-- Maria is Ana's manager; Leo is a consented read-only family member.
insert into public.care_links (
  elder_id, member_id, member_role, access_level, status,
  invited_by, member_consent_at, elder_consent_at, activated_at
) values
  (
    'aaaaaaaa-0000-4000-8000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'caregiver', 'manage', 'active',
    'aaaaaaaa-0000-4000-8000-000000000001', now(), now(), now()
  ),
  (
    'aaaaaaaa-0000-4000-8000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000003',
    'family_member', 'view', 'active',
    'aaaaaaaa-0000-4000-8000-000000000001', now(), now(), now()
  );
