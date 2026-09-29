# Sprint 2 — Elder profile and emergency information (Flow G)

- **Status:** Draft for owner approval, written 2026-09-29 at the owner's request and planned with
  `@architect` (2026-09-29). Revised the same day to fold in the `@architect` critique:
  restrictive foreign keys, server-derived manager checks, verification reset on edit, an explicit
  reorder RPC, the one-primary invariant, the completeness rule and accessibility/copy
  traceability. Implementation has not started.
- **Branch:** `sprint-2-elder-profile-emergency`.
- **Flow:** `docs/00-product-flow.md` Flow G (emergency), setup step A.2; `docs/adr/adr-004`
  Decision A (ordered list of emergency numbers with one dominant call action);
  `docs/adr/adr-001` (third role, care-circle membership).
- **Depends on:** Sprint 1 accepted (schema, RLS, RPCs, 124/124 pgTAP) and the Sprint 1b cutover
  merged, so an active caregiver → elder link and a real signed-in session exist.

## Goal

Replace the current honest empty emergency screen with real, RLS-scoped Supabase data. Add one
`elder_profiles` row per linked elder and an ordered `emergency_numbers` list, both managed by the
linked caregiver and readable by the elder (read-only) and by active connected family members
(read-only). The visible result: the caregiver completes the elder profile at setup (`A-09`) and
can edit it later (`C-10`, `C-11`); the elder opens `E-07` and gets one dominant
`Call <name> - emergency contact` action plus the ordered list, a `Verified by caregiver`
timestamp, allergies, conditions, blood type, care instructions, doctor, address and the elder's
identity.

The screen keeps one thing honest: **active medicines do not exist until Sprint 3**, so `E-07`
shows a clear partial state instead of fabricated medicine rows.

No new role, no family UI, no reminders. Family screens (`F-04`, `F-09`) remain Sprint 8 — but the
read policy for active family members is decided and shipped here so the data boundary never needs
reopening.

## User stories

1. As a caregiver manager, I can create and edit my linked elder's profile (identity, blood type,
   address, allergies, conditions, care instructions, doctor) and see it read-only afterwards.
2. As a caregiver manager, I can add, order, verify, edit and deactivate emergency numbers across
   the five categories, keeping exactly one dominant call contact.
3. As an elder, I can open `E-07`, see my verified information and ordered numbers read-only, and
   tap one number to open the dialer for confirmation.
4. As an elder, I am told when a number has been verified by my caregiver, and I never edit it.
5. As a connected family member with an active link, I can read the same information without any
   edit affordance.
6. As an unrelated account, I see nothing and cannot write anything.
7. As the owner, I can prove every read and write in pgTAP and see the honest partial state for
   active medicines.

## Screens

Frame IDs are the approved inventory (`docs/02-ui-ux-standard.md` §8.4) and must appear verbatim
in component names, comments and tests.

- **`A-09` Create Elder Profile** — caregiver setup step, reached from the caregiver setup path
  (`A-02 → … → A-09 → C-01`). Fields: identity (name comes from `profiles`), date of birth, blood
  type, address, allergies, conditions (free text), care instructions, doctor name and phone, and
  the initial emergency numbers. Label above field, phone keyboard for numbers, inline validation,
  48 dp targets.
- **`C-10` Elder Profile** — caregiver read view of the same data, with the emergency numbers and
  their verified state.
- **`C-11` Edit Elder Profile** — caregiver edit view; save produces an audit row.
- **`E-07` Emergency Information** — elder read view: the one dominant
  `Call <name> - emergency contact` action, a `Verified by caregiver` timestamp, the ordered list
  (local emergency service, primary caregiver, alternate family contact, doctor/clinic, optional
  pharmacy), allergies, conditions, blood type, care instructions, doctor and address. Active
  medicines are a documented partial state until Sprint 3.
- **Dialer** — tapping any number shows an in-app confirmation and then calls
  `Linking.openURL('tel:<number>')`; the app never auto-calls, dispatches, or shares location.

Exact copy comes from `docs/02-ui-ux-standard.md` §10/§13; the known required strings are
`Call <name> - emergency contact` and `Verified by caregiver`. **Every rendered string and every
interactive element's `accessibilityLabel` is traced to the UI standard before implementation; a
string with no approved source is escalated to the owner rather than invented.** The screens also
carry the standard loading, error and empty states, and the app-bar notification bell required by
§6.

### Completeness rule

Product flow §8 requires the caregiver to verify the local emergency-service details for the
elder's region. The emergency set is treated as **complete** only when the `emergency_service` row
exists, is active and is verified. Until then `E-07` shows an explicitly incomplete, non-clinical
state (copy traced to the UI standard; if no approved string exists, the owner approves one). The
profile may otherwise be saved partially — an elder must never be blocked from a record because an
optional field is empty.

## Data touched

### Migration `supabase/migrations/20261001120000_sprint2_elder_profile.sql`

`public.elder_profiles` — one row per linked elder:

- `elder_id uuid primary key references public.profiles(id) on delete restrict` — account deletion
  is deactivation only; care records are never cascaded away.
- `date_of_birth date`, `blood_type text` (check in `A+ A- B+ B- AB+ AB- O+ O- unknown`, default
  `unknown`).
- Address: `address_line1`, `address_line2`, `city`, `region`, `postal_code`, `country_code` (text).
- `allergies text`, `conditions text`, `care_instructions text` — free text, rendered exactly as
  the caregiver typed it; no clinical interpretation.
- `doctor_name text`, `doctor_phone text`.
- `created_by uuid references public.profiles(id)`, `created_at`, `updated_at timestamptz`.
- Text fields reject whitespace-only values (trim check in the RPC and a `length(btrim(...)) > 0`
  check on the required ones).

`public.emergency_numbers` — the ordered list:

- `id uuid primary key default gen_random_uuid()`.
- `elder_id uuid not null references public.profiles(id) on delete restrict`.
- `category text not null` (check in `emergency_service`, `primary_caregiver`, `alternate_family`,
  `doctor`, `pharmacy`).
- `label text not null`, `phone text not null`, `priority integer not null`, `priority >= 0`.
- `is_primary boolean not null default false` — the dominant `Call` action.
- `verified_at timestamptz`, `verified_by uuid references public.profiles(id)`.
- `is_active boolean not null default true`, `created_by`, `created_at`, `updated_at`.
- Partial unique index: at most one active row per `(elder_id, category)`.
- Partial unique index: at most one active `is_primary` row per `elder_id`.
- Partial unique index: `(elder_id, priority)` unique among active rows.
- **Invariant (enforced by the RPCs, proven in pgTAP):** while an elder has any active number,
  exactly one of them is primary. The first number created becomes primary unless another is
  named; deactivating the primary promotes the highest-priority remaining active number in the same
  transaction.

Both tables: `enable row level security`; **no** `insert`/`update`/`delete` grants to
`authenticated`. Select policy reuses the existing helper `public.can_view_profile(elder_id)`, which
already admits the elder themself, the linked manager and active family members; an unrelated
account gets zero rows. `updated_at` uses the existing `public.touch_updated_at()` trigger.

### RPCs (all `security definer`, `set search_path = public, pg_temp`)

Every RPC derives the owning elder **server-side from the target row** (or from `p_elder_id` on
create), then requires `is_manager_of(derived_elder_id)`; `p_id` alone is never trusted to authorize
an update. A rejected call writes no `audit_events` row.

- `public.upsert_elder_profile(p_elder_id uuid, p_date_of_birth date, p_blood_type text, p_address_line1 text, p_address_line2 text, p_city text, p_region text, p_postal_code text, p_country_code text, p_allergies text, p_conditions text, p_care_instructions text, p_doctor_name text, p_doctor_phone text) returns void`
  — manager-gated; upserts; audit `elder_profile.updated`.
- `public.upsert_emergency_number(p_elder_id uuid, p_id uuid default null, p_category text, p_label text, p_phone text, p_priority integer, p_is_primary boolean default false) returns uuid`
  — manager-gated; validates label/phone/priority; on any change to `label`, `phone` or `category`
  it clears `verified_at`/`verified_by`; setting `is_primary` clears the previous primary; audit
  `emergency_number.upserted`.
- `public.reorder_emergency_numbers(p_elder_id uuid, p_order uuid[]) returns void` — manager-gated;
  locks the elder's active rows, requires `p_order` to be exactly the set of active ids (no missing,
  duplicated or foreign id), assigns `priority` by index, audit `emergency_numbers.reordered`.
- `public.set_emergency_number_verified(p_id uuid) returns void` — resolves the row's elder,
  manager-gated; sets `verified_at = now()`, `verified_by = auth.uid()`; audit
  `emergency_number.verified`.
- `public.deactivate_emergency_number(p_id uuid, p_reason text default null) returns void` —
  resolves the row's elder, manager-gated; sets `is_active = false`, never deletes; promotes the
  next primary if needed; audit `emergency_number.deactivated`.

`grant select on public.elder_profiles, public.emergency_numbers to authenticated` (RLS scopes
rows); `revoke all` from `public`/`anon`; `grant execute` on the RPCs to `authenticated` only.

### Shared package

- New `packages/shared/src/emergency.ts`: zod schemas for blood type, number category, and the
  emergency-number input (label, phone, priority, primary), plus a `phoneLooksValid()` helper that
  accepts a leading `+`, digits, spaces, hyphens and parentheses and rejects empty/too-short input.
  No new status enum is introduced, so `status-presentation.ts` needs no change unless the owner
  adds one; if a new status is added it must ship with a `status-presentation` entry and tests.

## Acceptance criteria

1. pgTAP: an unrelated account selects zero rows from both tables; the linked caregiver and the
   elder select exactly the elder's rows.
2. pgTAP: a direct `insert`, `update` or `delete` on either table from `authenticated` is rejected
   with `42501`.
3. pgTAP: each RPC rejects an elder, a family member and an unrelated account with
   `insufficient_privilege` or `42501`.
4. pgTAP: `upsert_emergency_number` rejects a missing label, an empty/invalid phone, a missing
   priority and a whitespace-only label.
5. pgTAP: setting a second active primary number clears the previous one; two active rows with the
   same `(elder_id, category)` are rejected; the five categories can each hold at most one active
   row.
6. pgTAP: `deactivate_emergency_number` keeps the row, sets `is_active = false`, and a subsequent
   `upsert_emergency_number` for the same category succeeds.
7. pgTAP: every write RPC writes exactly one `audit_events` row with the documented action string
   and the correct `target_id`.
8. Shared unit tests: the emergency zod schemas accept valid synthetic input and reject invalid
   input; `phoneLooksValid` covers the documented cases.
9. Mobile: `A-09` and `C-11` validate required fields inline, use the phone keyboard for numbers and
   48 dp targets; `C-10` and `E-07` render read-only with no edit affordance.
10. Mobile: `E-07` shows one dominant `Call` action, the ordered list, the `Verified by caregiver`
    timestamp, and the honest partial state for active medicines; tapping a number confirms in-app
    before opening the dialer.
11. Mobile: a connected family member sees the read-only data; an unrelated signed-in account sees
    the honest empty state.
12. No `Alert.alert` or system dialog anywhere in the flow; confirmations use in-app components.
13. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; the Sprint 1 pgTAP total (124) plus the new assertions pass locally and on hosted.
14. The demo runbook step is recorded: caregiver creates the profile and numbers on the installed
    app; the elder sees them; the dialer opens.
15. pgTAP (IDOR): a manager of elder A cannot update, verify, deactivate or reorder elder B's
    numbers, and no audit row is written on the rejected call.
16. pgTAP (verification reset): editing a number's label, phone or category clears
    `verified_at`/`verified_by`; re-verifying sets them again.
17. pgTAP (primary invariant): exactly one primary exists whenever active rows exist; deactivating
    the primary promotes the next-highest; the invariant holds after every RPC.
18. pgTAP (reorder): `reorder_emergency_numbers` rejects an array that omits an active id, includes
    a foreign id or duplicates an id, and applies a full valid reorder atomically.
19. pgTAP (completeness): with no active `emergency_service` row or an unverified one, the list is
    not "complete"; verifying it (and only then) makes it complete.
20. pgTAP (no hard delete): a `profiles` delete does not cascade away `elder_profiles` or
    `emergency_numbers` rows.
21. Mobile (traceability/accessibility): each screen component names its frame ID; every rendered
    string and interactive `accessibilityLabel` is traced to the UI standard; 360 dp width and 200%
    font scale render without clipping; the dialer is preceded by an in-app confirmation.

## Out of scope

- `F-04` / `F-09` family screens and the full family UI (Sprint 8); only the read policy ships here.
- Active medicines on `E-07` (Sprint 3) — documented partial state meanwhile.
- Prescriptions and evidence (Sprint 6), appointments (Sprint 7), reports (Sprint 9).
- Any reminder/notification scheduling; this sprint writes data the later sprints read.
- Migrating the local fixture data in `apps/mobile/src/fixtures/emergency.ts`; it is deleted or
  reduced to test-only synthetic fixtures.

## Open questions for the owner (each with a recommendation)

1. **Profile field set.** The docs name demographics, address, allergies, conditions, blood type,
   care instructions and doctor, but not the exact columns. *Recommendation:* the minimal set above
   (no sex/gender field — it is not in any approved document).
2. **Allergies/conditions shape.** Free text vs a coded list. *Recommendation:* free text, repeated
   back to the elder exactly; a coded list would invite interpretation the product forbids.
3. **Phone validation.** Strict E.164 vs permissive. *Recommendation:* permissive with a minimum
   digit count (old and short local numbers exist); store as entered, dial as stored.
4. **Re-authentication.** Profile and number edits are not among the four re-auth actions (consent,
   unlink, account deletion, evidence access). *Recommendation:* no re-auth for these writes; every
   change still writes an audit row. Confirm this reading.
5. **Verification lifecycle (now normative).** Editing `label`/`phone`/`category` clears
   `verified_at`; the caregiver re-verifies. Confirm this is the intended meaning of
   `Verified by caregiver`.
6. **Completeness copy.** The incomplete-state wording for `E-07` needs an approved string.
   *Recommendation:* the owner approves one, or the UI standard is amended; do not invent it.
7. **Family read access timing.** Ship the read policy now or wait for Sprint 8.
   *Recommendation:* ship now (one policy, matches `00-product-flow.md` §2) with no family UI.
8. **Unlinked elder.** *Recommendation:* no profile row exists until the manager creates it; the
   elder's screen shows an honest empty state, never blank fields.

## Risks

- **Elder confusion from a list.** ADR-004 keeps one dominant action for this reason; the ordered
  list must sit behind a disclosure and never compete with the Call button.
- **Verification drift.** If edits do not clear `verified_at`, the elder can trust a stale number;
  acceptance criteria 16 and the normative lifecycle protect this.
- **Policy reuse.** `can_view_profile` behaviour must be asserted in pgTAP, not assumed, so adding
  the family read policy cannot widen access silently.
- **Copy drift / accessibility gaps.** Every string and label must be traced; inventing labels is a
  defect, and a 200% font-scale pass is required.
- **Scope creep.** `E-07` will tempt a medicines section; it stays out until Sprint 3 ships real
  data.
