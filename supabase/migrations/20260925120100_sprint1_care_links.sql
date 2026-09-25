-- Sprint 1 (2/3): the care circle.
--
-- An elder's circle is the set of care_links rows that point at them:
--   * exactly one active caregiver ("the manager"), access_level = 'manage';
--   * any number of connected family members, access_level = 'view'.
--
-- A link is created by redeeming an invite and becomes active only once the
-- required consents are recorded. Nothing is hard-deleted: status moves to
-- 'revoked' and the row is kept as history
-- (docs/00-product-flow.md section 2, docs/adr/adr-001).

create table public.care_links (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.profiles (id) on delete restrict,
  member_id uuid not null references public.profiles (id) on delete restrict,
  member_role text not null check (member_role in ('caregiver', 'family_member')),
  access_level text not null check (access_level in ('manage', 'view')),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  invited_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  member_consent_at timestamptz,
  elder_consent_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoke_reason text,
  constraint care_links_not_self check (member_id <> elder_id),
  constraint care_links_role_matches_access check (
    (member_role = 'caregiver' and access_level = 'manage')
    or (member_role = 'family_member' and access_level = 'view')
  ),
  constraint care_links_active_needs_consent check (
    status <> 'active'
    or (member_consent_at is not null and elder_consent_at is not null and activated_at is not null)
  ),
  constraint care_links_revoked_needs_timestamp check (
    (status = 'revoked') = (revoked_at is not null)
  )
);

comment on table public.care_links is
  'Care-circle membership: one manager + N view-only family members per elder.';

-- One membership per (elder, member) pair at a time; a revoked row is kept so the
-- pair can be re-invited later without losing history.
create unique index care_links_unique_live_pair
  on public.care_links (elder_id, member_id)
  where status <> 'revoked';

-- Exactly one active manager per elder ...
create unique index care_links_one_manager_per_elder
  on public.care_links (elder_id)
  where member_role = 'caregiver' and status = 'active';

-- ... and a manager looks after one elder (docs/00-product-flow.md section 2).
create unique index care_links_one_elder_per_manager
  on public.care_links (member_id)
  where member_role = 'caregiver' and status = 'active';

create index care_links_by_member on public.care_links (member_id, status);

-- Invitations. A caregiver creates one so an older adult can link to them
-- (grants_member_role = 'caregiver', elder unknown until redemption), or so a
-- connected family member can join an existing circle
-- (grants_member_role = 'family_member', elder known at creation).
create table public.care_link_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete restrict,
  elder_id uuid references public.profiles (id) on delete restrict,
  grants_member_role text not null check (grants_member_role in ('caregiver', 'family_member')),
  invitee_email text,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  consumed_at timestamptz,
  consumed_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint care_link_invites_expiry_after_creation check (expires_at > created_at),
  constraint care_link_invites_elder_scope check (
    (grants_member_role = 'family_member' and elder_id is not null)
    or (grants_member_role = 'caregiver' and elder_id is null)
  )
);

comment on table public.care_link_invites is
  'Six-digit, single-use, 24-hour link codes, stored only as a bcrypt hash.';

create index care_link_invites_open
  on public.care_link_invites (expires_at)
  where consumed_at is null;
