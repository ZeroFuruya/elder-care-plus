# Sprint 2 — Elder profile and emergency information (Flow G)

- **Status:** Approved for implementation 2026-09-29. Drafted that day and planned with
  `@architect`; the first pass folded in restrictive foreign keys, server-derived manager checks,
  verification reset on edit, an explicit reorder RPC, the one-primary invariant, the completeness
  rule and accessibility/copy traceability. A second `@architect` pre-implementation review found
  three mechanics that would fail at runtime, now fixed here: the **reorder algorithm** (two-phase
  priority reassignment), the **exactly-one-primary invariant** (elder-scoped advisory lock in
  every mutating RPC) and the **edit/verify race** (row locking). Owner decisions recorded below:
  the `E-07` incomplete-state strings, **no** re-authentication for profile/number writes, and
  **state-changing-only** audit rows. Implemented and shipped on
  `sprint-2-elder-profile-emergency` (60 pgTAP assertions); awaiting the owner's formal sign-off at
  the 2026-10-01 checkpoint.
- **Branch:** `sprint-2-elder-profile-emergency`, based on `sprint-1b-supabase-cutover`.
- **Flow:** `docs/00-product-flow.md` Flow G (emergency), setup step A.2; `docs/adr/adr-004`
  Decision A (ordered list of emergency numbers with one dominant call action);
  `docs/adr/adr-001` (third role, care-circle membership).
- **Depends on:** Sprint 1 accepted (schema, RLS, RPCs, 124/124 pgTAP) and the six Sprint 1b
  migrations applied, so an active caregiver → elder link and a real signed-in session exist. This
  migration references `profiles`, `care_links`, `can_view_profile`, `is_manager_of`,
  `touch_updated_at` and `audit_events`, all created by the Sprint 1b migrations. **Do not apply it
  to hosted before `npx supabase migration list` shows the cutover migrations are in.**

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
  the initial emergency numbers. Label above field, phone keyboard for numbers, inline validation
  on blur, 48 dp targets.
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

Exact copy comes from `docs/02-ui-ux-standard.md` §10/§13; every rendered string and every
interactive element's `accessibilityLabel` is traced to the UI standard before implementation. **A
string with no approved source is escalated to the owner, never invented.** The screens also carry
the standard loading, error and empty states, and the app-bar notification bell required by §6.

### Approved copy (owner, 2026-09-29)

The UI standard has no emergency-completeness string, so the owner approved these verbatim. They
follow §10: sentence case, no exclamation marks, named actions, routed to a human.

| State | String |
| --- | --- |
| `E-07` with no profile row (or an unrelated account's honest empty state) | `No emergency information yet. Your caregiver sets this up.` |
| `E-07` emergency service absent **or** unverified | `The emergency service number is not verified yet. Contact your caregiver.` |
| `E-07` active-medicines partial state (until Sprint 3) | `Medicines are not shown here yet.` |
| Dominant call action | `Call <name> - emergency contact` |
| Verified marker | `Verified by caregiver` |
| `E-07` ordered-list disclosure trigger | `Emergency contacts` |
| Dialer confirmation action (`Call` + record name, §12) | `Call <name>` |

The dialer confirmation reuses the same "name the record and the effect" rule (§12) and is an
in-app component, never a system dialog.

### Owner-approved wording (owner, 2026-09-30)

Criterion 22 escalates a string with no approved source instead of inventing one. The 18 strings
these screens needed beyond the table above were raised to the owner on 2026-09-29 and approved
verbatim on 2026-09-30. Each is recorded as `owner-approved` in
`apps/mobile/src/fixtures/copy-sources.ts` together with the reason it was needed, and
`COPY_ESCALATIONS` is therefore empty:

address field labels (`Address line 1`, `Address line 2`, `City`, `Region`, `Postal code`,
`Country`); the `YYYY-MM-DD` date hint and its inline error `Enter the date as YYYY-MM-DD.`; the
contacts empty state `No emergency contacts yet.`; `Primary contact`; `Move up`; `Move down`;
`Add contact`; `Enter a name for this contact.`; the deactivation effect `They stay in the record,
but the older adult no longer sees them.`; `Not verified yet`; and the no-link pair
`No linked older adult` / `Link with older adult first.`

The owner also settled the four open build decisions on 2026-09-30: `C-10` stays strictly
read-only, `A-09`'s `Save and continue` continues to `C-10` (the chain's `A-10`/`C-01` steps do not
exist yet, and the Profile tab keeps its `Elder profile`/`Edit profile` entries), `Birth date` is a
`YYYY-MM-DD` text field rather than a native picker, and `Full name` is not editable in `A-09` or
`C-11` because the name comes from `profiles`.

The owner settled one further follow-up on 2026-10-01: the caregiver dashboard (`C-01`) no longer
auto-redirects a linked older adult with no profile row to `A-09`. It now renders the same
create-profile prompt `C-10` uses (`No emergency information yet.` / `Create the older adult's
care and emergency profile.` / `Create elder profile`), so the back button is never trapped;
saving in `A-09` clears the prompt on the next focus read.

### Completeness rule

Product flow §8 requires the caregiver to verify the local emergency-service details for the
elder's region. The emergency set is treated as **complete** only when the `emergency_service` row
exists, is active and is verified. Until then `E-07` shows the approved incomplete, non-clinical
string above. The profile may otherwise be saved partially — an elder must never be blocked from a
record because an optional field is empty.

## Data touched

### Migration `supabase/migrations/20261001120000_sprint2_elder_profile.sql`

`public.elder_profiles` — one row per linked elder:

| Column | Type | Notes |
| --- | --- | --- |
| `elder_id` | `uuid primary key` | `references public.profiles(id) on delete restrict` — account deletion is deactivation only |
| `date_of_birth` | `date` | nullable |
| `blood_type` | `text not null default 'unknown'` | check in `A+ A- B+ B- AB+ AB- O+ O- unknown` |
| `address_line1` … `country_code` | `text` | nullable; each rejects a whitespace-only value |
| `allergies`, `conditions`, `care_instructions` | `text` | nullable free text, repeated back exactly; whitespace-only rejected |
| `doctor_name`, `doctor_phone` | `text` | nullable; whitespace-only rejected |
| `created_by` | `uuid` | `references public.profiles(id) on delete restrict` |
| `created_at`, `updated_at` | `timestamptz not null default now()` | `updated_at` via `elder_profiles_touch_updated_at` |

Free-text columns carry `check (col is null or length(btrim(col)) > 0)` so a blank string can never
be stored, while an absent optional field stays a genuine `null` (rendered as an honest empty state,
never fabricated).

`public.emergency_numbers` — the ordered list:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | |
| `elder_id` | `uuid not null` | `references public.elder_profiles(elder_id) on delete restrict` — a number cannot exist without a profile |
| `category` | `text not null` | check in `emergency_service`, `primary_caregiver`, `alternate_family`, `doctor`, `pharmacy` |
| `label`, `phone` | `text not null` | each `length(btrim(...)) > 0` |
| `priority` | `integer not null` | `check (priority >= 0)`; no default — the RPC rejects a null |
| `is_primary` | `boolean not null default false` | the dominant `Call` action |
| `verified_at` | `timestamptz` | null until verified |
| `verified_by` | `uuid` | `references public.profiles(id) on delete restrict`; `check ((verified_at is null) = (verified_by is null))` |
| `is_active` | `boolean not null default true` | deactivate, never delete |
| `created_by` | `uuid` | `references public.profiles(id) on delete restrict` |
| `created_at`, `updated_at` | `timestamptz not null default now()` | `updated_at` via `emergency_numbers_touch_updated_at` |

Indexes:

- `emergency_numbers_active_category_key` — unique `(elder_id, category)` **where `is_active`**.
- `emergency_numbers_active_priority_key` — unique `(elder_id, priority)` **where `is_active`**.
- `emergency_numbers_one_primary_key` — unique `(elder_id)` **where `is_active and is_primary`**.
- `care_links_elder_member_status_idx` on `public.care_links (elder_id, member_id, status)` — backs
  the reused `can_view_profile` helper. Existing indexes do not cover this full predicate.

**Primary invariant (proven in pgTAP):** while an elder has any active number, exactly one of them
is primary. The partial unique index enforces *at most one*; the "at least one" half is provided by
the elder-scoped advisory lock plus the `ensure_single_primary` normalization below. That is
documented explicitly: the invariant holds because every client write goes through the RPCs and
each of them takes the same lock — direct writes are revoked.

RLS: both tables `enable row level security`, with a `select` policy using
`public.can_view_profile(elder_id)` and **no** insert/update/delete policy (default deny). The
helper already admits the elder themself, the linked manager and active family members, and no
unrelated account. Note it is deliberately the existing circle predicate: it also lets a member
read another active member's `profiles` row, which is pre-existing Sprint 1 behaviour, asserted in
`supabase/tests/sprint1_accounts_and_care_circle.test.sql`. It must only ever be passed
`elder_id` — never `created_by` or `verified_by`.

### RPCs

All are `security definer`, `set search_path = public, pg_temp`, and `revoke execute … from public,
anon; grant execute … to authenticated` (matching the Sprint 1 convention). A rejected call writes
no `audit_events` row.

**Every RPC follows this order:**

1. Validate input shape.
2. Resolve `v_elder_id` (from `p_elder_id` on create, or from the target row resolved by `p_id`).
   With `p_id`, the row's elder is used — never a client-supplied `p_elder_id` fallback.
3. `if not public.is_manager_of(v_elder_id) then raise … insufficient_privilege`.
4. `perform pg_advisory_xact_lock(hashtextextended('emergency_numbers:' || v_elder_id::text, 0))`
   (the four number RPCs).
5. Re-read/lock the target row(s) with `for update`.
6. Mutate, normalize the primary, and write exactly one audit row **if state changed**.

- `public.upsert_elder_profile(p_elder_id uuid, p_date_of_birth date, p_blood_type text,
  p_address_line1 text, p_address_line2 text, p_city text, p_region text, p_postal_code text,
  p_country_code text, p_allergies text, p_conditions text, p_care_instructions text,
  p_doctor_name text, p_doctor_phone text) returns void` — manager-gated insert/update by primary
  key; audit `elder_profile.updated` (`target_table = 'elder_profiles'`, `target_id = p_elder_id`).
- `public.upsert_emergency_number(p_elder_id uuid, p_category text, p_label text, p_phone text,
  p_priority integer, p_is_primary boolean default false, p_id uuid default null) returns uuid`
  — `p_id` is last because Postgres requires every parameter after a defaulted one to have a
  default too; the client calls it by name, and with `p_id` the row's own elder is authoritative.
  Manager-gated; validates the label, a non-blank phone carrying at least three digits (so `995`,
  `999` and `112` are accepted), and a non-negative priority; on any change to `label`, `phone` or
  `category`
  it clears `verified_at`/`verified_by`; setting `is_primary` clears the previous primary. **A
  category conflict is rejected** (existing row updated in place, or a new insert refused when an
  active row already holds that category) — another contact is never silently deactivated or
  overwritten. Audit `emergency_number.upserted`.
- `public.reorder_emergency_numbers(p_elder_id uuid, p_order uuid[]) returns void` — manager-gated;
  validates that `p_order` is exactly the active id set (no missing, duplicated or foreign id)
  **before** writing; then, under the lock, performs a **two-phase reassignment** because
  `(elder_id, priority)` is uniquely indexed and a direct assign fails on any swap:
  1. `update … set priority = priority + v_offset where elder_id = v_elder_id and is_active`
     (`v_offset = max(active priority) + active count + 1`);
  2. assign `0..n-1` by array index.
  Audit `emergency_numbers.reordered`.
- `public.set_emergency_number_verified(p_id uuid) returns void` — resolves the row's elder,
  manager-gated, locks the row `for update`; sets `verified_at = now()`, `verified_by = auth.uid()`;
  audit `emergency_number.verified`.
- `public.deactivate_emergency_number(p_id uuid, p_reason text default null) returns void` —
  resolves the row's elder, manager-gated, locks the row; sets `is_active = false` (never deletes),
  then promotes the highest-priority survivor if it was the primary; audit
  `emergency_number.deactivated`.

`ensure_single_primary(p_elder_id uuid)` is an **internal** helper (not granted to `authenticated`)
called at the end of every mutating number RPC: if active rows exist and none is primary, it
promotes the lowest-priority active row. It keeps the "exactly one" half of the invariant.

Row locking makes the edit/verify interleave deterministic: an edit that commits after a verify
clears verification; a verify that commits after an edit verifies the edited row. Both RPCs take
`for update` under the same elder lock.

### Audit rows

`audit_events(actor_id, elder_id, action, target_table, target_id, before_summary, after_summary,
created_at)`. Every state-changing RPC writes exactly one row with
`actor_id = auth.uid()`, **`elder_id` = the resolved elder** (required — the audit select policy is
scoped by `elder_id`), `target_table` = `elder_profiles` / `emergency_numbers`, `target_id` = the
profile or number id, and the action string above. `before_summary`/`after_summary` carry
non-sensitive state only — **never** phone numbers, addresses, allergies, conditions or care
instructions. A **no-op call writes no audit row** (owner decision, 2026-09-29); acceptance
criterion 7 is worded accordingly.

### Shared package

- New `packages/shared/src/emergency.ts`: zod schemas for blood type, number category and the
  emergency-number input (label, phone, priority, primary), plus:
  - `phoneLooksValid()` — accepts a leading `+`, digits, spaces, hyphens and parentheses, and
    rejects empty/too-short input (permissive; old and short local numbers exist). The database
    enforces the same three-digit floor, so client and server agree.
  - `dialNumber()` — derives the value handed to the dialer: trim, keep a leading `+`, drop other
    non-digits. The stored value remains exactly what the caregiver typed, and the phone value is
    never logged. The dial string is derived at call time, not stored as a second column.
- No new status enum is introduced, so `status-presentation.ts` needs no change. If the owner adds
  one later it must ship with a `status-presentation` entry and tests.

## Acceptance criteria

### Database (pgTAP, `supabase/tests/sprint2_elder_profile.test.sql`)

1. An unrelated account selects zero rows from both tables; the linked caregiver and the elder
   select exactly the elder's rows; an active family member selects them read-only.
2. A direct `insert`, `update` or `delete` on either table from `authenticated` is rejected with
   `42501`.
3. Each RPC rejects an elder, a family member and an unrelated account with
   `insufficient_privilege` or `42501`.
4. `upsert_emergency_number` rejects a missing label, an empty/invalid phone, a missing priority and
   a whitespace-only label.
5. Setting a second active primary clears the previous one; two active rows with the same
   `(elder_id, category)` are rejected; each of the five categories can hold at most one active row.
6. `deactivate_emergency_number` keeps the row, sets `is_active = false`, promotes the survivor if
   the primary was deactivated, and a later `upsert_emergency_number` for the same category
   succeeds.
7. Every **state-changing** write RPC writes exactly one `audit_events` row with the documented
   action, `target_table`, `target_id` and a non-null `elder_id`; a no-op call writes none.
8. `upsert_elder_profile` upserts, rejects a blank required value with `23514`, and leaves an absent
   optional field as `null`.
9. IDOR: a manager of elder A cannot update, verify, deactivate or reorder elder B's numbers, and no
   audit row is written on the rejected call.
10. Verification reset: editing a number's label, phone or category clears `verified_at`/
    `verified_by`; re-verifying sets them again.
11. Primary invariant: exactly one primary exists whenever active rows exist; the first insert
    becomes primary; deactivating the primary promotes the lowest-priority survivor; the invariant
    holds after each RPC.
12. Reorder: `reorder_emergency_numbers` rejects an array that omits an active id, includes a
    foreign id or duplicates an id, **and a valid swap succeeds** (the two-phase path).
13. Category conflict: inserting a second active row in an occupied category is rejected and does
    not deactivate the existing row.
14. Completeness: with no active `emergency_service` row, or an unverified one, the list is not
    complete; verifying it (and only then) makes it complete.
15. No hard delete: a `profiles` delete does not cascade away `elder_profiles` or
    `emergency_numbers` rows; a number cannot be created without an `elder_profiles` row.
16. RPC exposure: `has_function_privilege` confirms `authenticated` may execute the five RPCs and
    may **not** execute `ensure_single_primary`; `anon`/`public` may execute none.

**Honest limitation, recorded not hidden:** the single-session pgTAP harness cannot prove true
concurrency. Criterion 11 proves the invariant across every serialized RPC sequence; the
elder-scoped advisory lock is the concurrency mechanism, asserted present in the RPC bodies. A
two-session integration test is a follow-up if the owner wants concurrency proven rather than
reasoned.

### Shared package (vitest)

17. The emergency zod schemas accept valid synthetic input and reject invalid input;
    `phoneLooksValid` and `dialNumber` cover the documented cases (permissive input, normalised dial
    string, no logging).

### Mobile (component + accessibility tests, manual APK)

18. `A-09` and `C-11` validate required fields inline on blur, use the phone keyboard for numbers
    and 48 dp targets; `C-10` and `E-07` render read-only with no edit affordance.
19. `E-07` shows one dominant `Call` action, the ordered list behind a disclosure, the
    `Verified by caregiver` timestamp, and the approved partial state for active medicines; tapping
    a number confirms in-app before opening the dialer.
20. A connected family member sees the read-only data; an unrelated signed-in account sees the
    approved empty state.
21. No `Alert.alert` or system dialog anywhere in the flow; confirmations use in-app components.
22. Traceability/accessibility: components are named `A09CreateElderProfile`,
    `C10ElderProfile`, `C11EditElderProfile`, `E07EmergencyInformation`; a copy/label fixture maps
    each static string to its approved source (UI standard or the table above); 360 dp width and
    200% font scale render without clipping; the dominant action stays reachable and the last list
    row clears the tab bar.

### Repo

23. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; the Sprint 1 pgTAP total (124) plus the new assertions pass locally and on hosted.
24. The demo runbook step is recorded: caregiver creates the profile and numbers on the installed
    app; the elder sees them; the dialer opens.

## Out of scope

- `F-04` / `F-09` family screens and the full family UI (Sprint 8); only the read policy ships here.
- Active medicines on `E-07` (Sprint 3) — the approved partial state meanwhile.
- Prescriptions and evidence (Sprint 6), appointments (Sprint 7), reports (Sprint 9).
- Any reminder/notification scheduling; this sprint writes data the later sprints read.
- Re-authentication for these writes (owner decision, 2026-09-29: audit only).
- Migrating the local fixture data in `apps/mobile/src/fixtures/emergency.ts`; it is deleted or
  reduced to test-only synthetic fixtures.

## Open questions for the owner — resolved 2026-09-29

1. **Profile field set** — the minimal set above, no sex/gender field (not in any approved
   document). *Resolved.*
2. **Allergies/conditions shape** — free text, repeated back exactly; no coded list. *Resolved.*
3. **Phone validation** — permissive with a minimum digit count; stored as entered, dialled via
   `dialNumber()`. *Resolved.*
4. **Re-authentication** — none for profile/number writes; every state change writes an audit row.
   *Resolved: no re-auth.*
5. **Verification lifecycle** — editing `label`/`phone`/`category` clears `verified_at`; the
   caregiver re-verifies. *Resolved.*
6. **Completeness copy** — approved verbatim in the "Approved copy" table above. *Resolved.*
7. **Family read access timing** — ship the read policy now, no family UI. *Resolved.*
8. **Unlinked elder** — no profile row until the manager creates it; the elder sees the approved
   empty state. *Resolved.*

## Risks

- **Elder confusion from a list.** ADR-004 keeps one dominant action for this reason; the ordered
  list sits behind a disclosure and never competes with the Call button.
- **Verification drift.** If edits do not clear `verified_at`, the elder can trust a stale number;
  criterion 10 and the row-locking rule protect this.
- **Concurrency.** The invariant relies on every write taking the elder lock. That is why direct
  writes are revoked, `ensure_single_primary` is internal-only, and the limitation is documented.
- **Policy reuse.** `can_view_profile` is a broader circle predicate; it is asserted in pgTAP and
  only ever passed `elder_id`.
- **Copy drift / accessibility gaps.** Every string is traced; inventing labels is a defect, and a
  200% font-scale pass is required.
- **Scope creep.** `E-07` will tempt a medicines section; it stays out until Sprint 3 ships real
  data.
