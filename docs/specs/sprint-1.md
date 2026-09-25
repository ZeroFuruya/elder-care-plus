# Sprint 1 — Accounts, roles, care circle and consent (schema first)

- **Status:** Draft for owner approval. Written and implemented on 2026-09-25 at the owner's
  request; the owner must still review and accept it (`docs/specs/README.md`,
  `docs/01-dev-environment.md` §10).
- **Branch:** `sprint-1-accounts-care-circle`.
- **Flow:** `docs/00-product-flow.md` Flow A.
- **Decisions this depends on:** `docs/adr/adr-001` (third role, care circle), all ADRs now Accepted.

## Goal

Stand up the first slice of the Supabase product schema: profiles for the three roles, the care
circle, the link-code invitation flow, and an append-only audit trail — with RLS default-deny and
every audited write behind a guarded RPC. **The mobile app is not touched this sprint**; it keeps
running on SQLite. The cutover is Sprint 1b (`docs/01-dev-environment.md` §11).

Scope was deliberately kept to "schema first, app second" so the database, its policies and its
tests can be reviewed on their own.

## User stories

1. As a new user I sign up and receive **one** profile with the role I chose, and I can never change
   that role myself.
2. As a caregiver I generate a **six-digit, single-use, 24-hour** code. An older adult enters it and
   becomes my linked elder; I become their single manager.
3. As a caregiver (manager) I can invite a **connected family member** by code; they redeem it, the
   **elder consents**, and only then does the family member gain read-only access.
4. As an elder I can revoke a family member's access, and re-authenticate to do it.
5. As any user I can deactivate my account; nothing is hard-deleted, and my links are revoked.
6. As the operator I can prove, with database tests, that an unrelated account reads zero rows and
   that a retried redemption cannot create a duplicate link.

## Acceptance criteria

1. `profiles.role ∈ (caregiver, elder, family_member)`; a client UPDATE cannot change `role`,
   `id`, or set `deactivated_at` back to null.
2. An auth-user INSERT creates exactly one profile via trigger, and rejects an unknown role in the
   sign-up metadata.
3. `care_links` enforces: `member_id <> elder_id`; `caregiver ⇒ access_level = manage`;
   `family_member ⇒ access_level = view`; `status = active ⇒ both consents set`.
4. At most **one active manager per elder** and **one active elder per manager**; any number of
   active family members.
5. A six-digit code is single-use, expires after 24 hours, and is stored only as a bcrypt hash. A
   retried or replayed redemption creates no second link.
6. An elder-link invite yields `status = active` on redemption (the elder's redemption *is* their
   consent). A family-member invite yields `status = invited` until the elder consents.
7. Every guarded write appends one `audit_events` row, and `audit_events` rejects UPDATE and
   DELETE.
8. Default deny: an authenticated user who is not part of a circle reads **zero** rows from
   `profiles`, `care_links`, `care_link_invites` and `audit_events`. No table grants INSERT, UPDATE
   or DELETE to `authenticated`.
9. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, `pnpm check:contrast` stay green
   (the app is untouched, so this is a regression check).
10. `npx supabase db reset` applies cleanly and seeds synthetic fixtures for all three roles;
    `npx supabase test db` passes.

## Screens

**None.** This sprint is schema only. The routes a later sprint adds are noted for context only:
`(auth)` sign-up already exists; the `(family)` route group and the family UI are Sprint 8.

## Data touched

| Object | Purpose |
|---|---|
| `profiles` | one row per auth user; `role` immutable, soft-delete via `deactivated_at` |
| `care_links` | care-circle membership: `member_role`, `access_level`, `status`, consent timestamps |
| `care_link_invites` | hashed six-digit codes, scope, expiry, attempts |
| `audit_events` | append-only trail, scoped by `elder_id` |
| helpers | `is_elder_self`, `is_manager_of`, `is_active_member_of`, `can_view_profile` |
| RPCs | `create_elder_link_invite`, `invite_family_member`, `redeem_care_link_code`, `consent_to_care_link`, `revoke_care_link`, `deactivate_account` |

Migrations ship **with** their RLS policies and tests (Definition of Done), split into coherent
files: profiles → care circle → RLS/helpers/RPCs.

## Out of scope

- Cutting the mobile app over to Supabase Auth (Sprint 1b).
- The `(family)` route group and all `F-` screens; help requests and availability (Sprint 8).
- Elder profile, emergency numbers (Sprint 2); medicines, doses, appointments (3–7).
- Email delivery / SMTP; the invitee is told the code out of band. Local `enable_confirmations =
  false`.
- Hosted Supabase project and any deployed environment.
- Consent *re-authentication enforcement* beyond recording consent timestamps and requiring a fresh
  token: Supabase exposes no server-side "recent password" flag, so the RPC records consent and the
  client re-authenticates first (documented as an accepted limitation in the ADR follow-up).

## Test plan (pgTAP, `supabase/tests/`)

- Signup trigger creates a profile; unknown role rejected.
- Role is immutable; column grant stops other profile edits.
- Unique indexes: second active manager rejected; second active elder per manager rejected; many
  family members allowed.
- Redemption: correct code activates an elder link; replay fails; wrong code burns an attempt;
  expired code fails.
- Family join stays `invited` until `consent_to_care_link`; then active.
- `revoke_care_link` sets `revoked` and removes access.
- Append-only: UPDATE and DELETE on `audit_events` both raise.
- RLS: unrelated user reads zero rows from all four tables.

## Risks

- **Approved docs lag.** The approved system documentation still describes two roles and no stock /
  prescriptions. Each ADR carries the follow-up; the PDFs are an owner task.
- **Weak code entropy.** Six digits is brute-forceable without the attempt cap; the cap (5) plus the
  24-hour expiry is the mitigation, and it must not be raised.
- **Re-auth is advisory.** See Out of scope; note it honestly in the thesis rather than claiming
  enforcement.
