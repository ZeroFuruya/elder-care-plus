# Sprint 1 — Accounts, roles, care circle and consent (schema first)

- **Status:** Draft for owner approval. Written and implemented on 2026-09-25 at the owner's
  request; the security closeout addendum (frozen 2026-09-27) adds three owner-required
  corrections. The owner must still review and accept the sprint at the 2026-10-01 checkpoint
  (`docs/specs/README.md`, `docs/01-dev-environment.md` §10).
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
- Consent *re-authentication enforcement* was deferred in this draft (it recorded consent
  timestamps and expected the client to re-authenticate first). **Superseded by the security
  closeout addendum below:** enforcement is now server-side.

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
- **Weak code entropy.** Six digits is brute-forceable without a rate limit; the per-account
  limit (5 evaluated failures per 15 minutes) plus the 24-hour expiry is the mitigation, and it
  must not be raised or removed. See the closeout addendum (SC-3).

---

## Security closeout addendum — frozen 2026-09-27 (checkpoint Thu 2026-10-01)

The owner's decisions of 2026-09-27 (`AGENTS.md`, "Current execution decisions") turn three
Sprint 1 details into security corrections that must be in place before acceptance. This addendum
freezes the corrections, their acceptance criteria and their tests. It supersedes the
"re-auth is advisory" note in *Out of scope* and the matching line in *Risks*.

The base migrations are already applied locally, so the corrections ship as **one new migration**
plus test updates; the existing migration files are not edited (`docs/01-dev-environment.md`
§8.1). Implementation is scheduled for Tue 2026-09-29; the mechanism confirmation the plan
expected on Mon 2026-09-28 is already done (see SC-2).

### SC-1 — Sign-up role is mandatory

**Gap.** `handle_new_user()` defaults a missing role to `elder`
(`coalesce(new.raw_user_meta_data ->> 'role', 'elder')`), so a sign-up that omits the role
silently creates an older-adult account.

**Frozen fix.** The trigger requires a present, non-blank role exactly equal to `caregiver`,
`elder` or `family_member`; anything else raises and the `auth.users` INSERT (and therefore the
sign-up) fails. No default, no fallback.

**Acceptance criteria**

1. A sign-up with no `role` key fails and creates no `auth.users` row and no profile.
2. A sign-up with a blank or whitespace-only role fails the same way.
3. An unknown role (`admin`) still fails (existing assertion).
4. Each valid role still creates exactly one profile with that role.

### SC-2 — Server-verifiable re-authentication

**Gap.** `consent_to_care_link`, `revoke_care_link` and `deactivate_account` act on any valid
session. Nothing re-checks that the person at the device is still the account holder.

**Mechanism (verified against the local stack, 2026-09-27).** Supabase access tokens carry
`amr: [{"method":"password","timestamp":<unix seconds>}]`. A local probe (synthetic account,
password sign-up, then `grant_type=refresh_token`) showed that the refresh renews `iat` but leaves
the `password` `amr` timestamp unchanged, so the claim records the last actual password entry and
cannot be reset by refreshing a stolen session. The database checks `auth.jwt() -> 'amr'` for a
`password` entry no older than **300 seconds**, and fails closed when the claim is missing or
older. The mechanism is confirmed locally; Sprint 1b re-verifies it against the hosted project
before the cutover.

Alternatives considered and rejected: a client "reauthenticated" boolean (forgeable; forbidden by
the owner decision); `iat` freshness alone (a token refresh renews it, so it proves nothing about
password entry); `supabase.auth.reauthenticate()` + MFA/AAL2 (that nonce flow is for password
changes only — it does not mark a session as recently re-authenticated for arbitrary RPCs — and
MFA needs Pro-plan factors plus an authenticator app for elderly users; revisit only if a
requirement forces it).

**Frozen fix.** An internal helper
`public.assert_recent_password_auth(p_max_age_seconds int default 300)` raises
`insufficient_privilege` ("re-authentication required") when unsatisfied, and is called first by
`consent_to_care_link`, `revoke_care_link` and `deactivate_account`. The helper is not executable
by `authenticated`. Every future consent, unlink, deactivation and evidence-access RPC must call
it (including the Sprint 6 evidence-review flow).

**Acceptance criteria**

1. With no `amr`, no `password` entry, or a password timestamp older than 300 s, each of the three
   RPCs raises `insufficient_privilege` and changes nothing.
2. With a password timestamp no older than 300 s, each RPC performs its normal authorization and
   effect; callers who are not the elder/manager still fail exactly as before.
3. A session that was only refreshed (stale `amr` password timestamp) does not satisfy the check —
   covered by criterion 1's stale case.
4. No RPC takes a client-supplied re-authentication flag or parameter.
5. `public.assert_recent_password_auth(int)` cannot be executed by `authenticated`.

### SC-3 — Invite-code abuse protection

**Gap.** A wrong code currently burns an attempt on the *newest open invite* for the caller's role
— in general **someone else's invite** — and an email-mismatch attempt burns the targeted invite.
Guessing therefore damages other users, and there is no per-account cooldown, no audit of failed
attempts, and clients can select `code_hash`.

**Frozen design**

- The invite-level `attempts` / `max_attempts` columns are dropped. Invalid attempts never modify
  any invite row.
- Rate limit per authenticated account (the redeemer): **5 *evaluated* failed attempts per rolling
  15 minutes**. While at or over the limit, the RPC returns `rate_limited` without evaluating the
  code. The count is derived from the failure audit rows, so refusing a call writes nothing and
  cannot extend its own cooldown.
- Failures are uniform. Wrong, expired, role-mismatched, email-mismatched and unknown codes all
  return exactly `{"status":"invalid"}`; nothing in the response reveals whether a code exists or
  expired. Malformed codes and callers whose profile role cannot redeem (a caregiver) also return
  `invalid` and are neither audited nor counted, because they can never match an invite.
- The result contract changes from `uuid` to `jsonb`:
  `{"status": "active" | "invited" | "invalid" | "rate_limited", "link_id": uuid | null,
  "retry_after_seconds": int | null}`; `retry_after_seconds` is present only for `rate_limited`,
  and `link_id` only for `active` / `invited`. Replay by the same redeemer returns the existing
  link's id with its current status. No mobile caller exists until Sprint 1b.
- Each evaluated failure appends one `audit_events` row
  (`action = 'care_link_invite.redeem_failed'`, `actor_id` = redeemer, `elder_id` null) with an
  internal reason in `after_summary` (`no_match` / `email_mismatch`); the audit row is visible to
  its actor only, under the existing RLS policy. Cooldown refusals are not audited.
- Unchanged: six-digit codes, bcrypt hashes only, 24-hour expiry, single-use with idempotent
  replay by the same redeemer, authenticated redeemer only.
- Hardening: clients lose SELECT on `code_hash` (column-level grant); invite metadata stays
  readable under the existing RLS policy.

**Acceptance criteria**

1. An invalid attempt never changes another account's invite: the invite is not consumed, not
   expired and not otherwise touched, and its rightful redeemer can still redeem it — including
   while the attacker is in cooldown.
2. The sixth evaluated failure within 15 minutes returns `rate_limited` with a positive
   `retry_after_seconds`; the call does not evaluate or consume a code; repeated refused calls do
   not extend the cooldown.
3. All failure outcomes listed above return byte-identical `{"status":"invalid"}`.
4. Every evaluated failure appends exactly one audit row, visible to its actor and no one else;
   cooldown refusals append none.
5. A correct code below the limit still activates or links exactly as before; a replay by the same
   redeemer returns the same `link_id` and creates no second link.
6. `code_hash` cannot be selected by `authenticated`, while the existing invite SELECT policy
   still returns the metadata columns.

### Tests and evidence

- Baseline before correction: `npx supabase test db` → **26/26 PASS** (re-run and confirmed
  2026-09-27).
- The existing suite is updated where it encodes retired behavior (the "wrong code burns an
  attempt on the open invite" assertion) and where the re-auth guard applies (consent, revoke and
  deactivation calls gain `amr` claims). New assertions cover SC-1, SC-2 and SC-3; the closeout
  reports the new total, per `AGENTS.md`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
  green (the mobile app is untouched).
- The adversarial pass (`@challenger`) targets the new redemption path and the audit-derived rate
  limiter before the Thursday checkpoint; `@gemini-reviewer` reviews the diff.

### Residual risks (accepted for this closeout)

- **Bcrypt scan cost.** Matching re-hashes the candidate against every open invite for the role,
  so many open invites amplify one call. Bounded by account-signup rate limits and the per-account
  failure limit; revisit with an indexed lookup (or an inviter hint) if open invites ever grow
  past demo scale.
- **Hosted `amr` behavior.** Verified locally only; Sprint 1b re-verifies before cutover.

### Out of scope for the closeout

- Mobile/client changes; Sprint 1b wires re-authentication and the new result shape.
- MFA/AAL2, account recovery, and the `(family)` UI (Sprint 8).
- **Re-auth was advisory.** Superseded 2026-09-27 by the closeout addendum: the three sensitive
  RPCs now require a server-verifiable recent password authentication.
