# Sprint 2 — Elder profile and emergency information (Flow G)

- **Status:** Draft for owner approval, written 2026-09-29 at the owner's request and planned with
  `@architect` (2026-09-29). Implementation has not started; the owner and `@architect` review it
  before any migration or screen work.
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
- **Dialer** — tapping any number calls `Linking.openURL('tel:<number>')`; the app never auto-calls,
  dispatches, or shares location.

Exact copy comes from `docs/02-ui-ux-standard.md` §10/§13; the known required strings are
`Call <name> - emergency contact` and `Verified by caregiver`. No new string may be invented, and
every rendered string is traced to the UI standard before implementation.

## Data touched

### Migration `supabase/migrations/20261001120000_sprint2_elder_profile.sql`

`public.elder_profiles` — one row per linked elder:

- `elder_id uuid primary key references public.profiles(id) on delete cascade`.
- `date_of_birth date`, `blood_type text` (check in `A+ A- B+ B- AB+ AB- O+ O- unknown`, default
  `unknown`).
- Address: `address_line1`, `address_line2`, `city`, `region`, `postal_code`, `country_code` (text).
- `allergies text`, `conditions text`, `care_instructions text` — free text, rendered exactly as
  the caregiver typed it; no clinical interpretation.
- `doctor_name text`, `doctor_phone text`.
- `created_by uuid references public.profiles(id)`, `created_at`, `updated_at timestamptz`.

`public.emergency_numbers` — the ordered list:

- `id uuid primary key default gen_random_uuid()`.
- `elder_id uuid not null references public.profiles(id) on delete cascade`.
- `category text not null` (check in `emergency_service`, `primary_caregiver`, `alternate_family`,
  `doctor`, `pharmacy`).
- `label text not null`, `phone text not null`, `priority integer not null`.
- `is_primary boolean not null default false` — the dominant `Call` action.
- `verified_at timestamptz`, `verified_by uuid references public.profiles(id)`.
- `is_active boolean not null default true`, `created_by`, `created_at`, `updated_at`.
- Partial unique index: at most one active row per `(elder_id, category)`.
- Partial unique index: at most one active `is_primary` row per `elder_id`.
- Unique order: `(elder_id, priority)` among active rows (reordering happens inside one RPC call).

Both tables: `enable row level security`; **no** `insert`/`update`/`delete` grants to
`authenticated`. Select policy reuses the existing helper `public.can_view_profile(elder_id)`, which
already admits the elder themself, the linked manager and active family members; an unrelated
account gets zero rows. `updated_at` uses the existing `public.touch_updated_at()` trigger.

### RPCs (all `security definer`, `set search_path = public, pg_temp`, manager-gated)

- `public.upsert_elder_profile(p_elder_id uuid, p_date_of_birth date, p_blood_type text, p_address jsonb, p_allergies text, p_conditions text, p_care_instructions text, p_doctor_name text, p_doctor_phone text) returns void` — requires `is_manager_of(p_elder_id)`; upserts; audit
  `elder_profile.updated`.
- `public.upsert_emergency_number(p_elder_id uuid, p_id uuid default null, p_category text, p_label text, p_phone text, p_priority integer, p_is_primary boolean default false) returns uuid` —
  manager-gated; validates label/phone/priority; clears any previous primary when setting a new
  one; audit `emergency_number.upserted`.
- `public.set_emergency_number_verified(p_id uuid) returns void` — manager-gated; sets
  `verified_at = now()`, `verified_by = auth.uid()`; audit `emergency_number.verified`.
- `public.deactivate_emergency_number(p_id uuid, p_reason text default null) returns void` —
  manager-gated; sets `is_active = false`, never deletes; audit `emergency_number.deactivated`.
- Reordering uses `upsert_emergency_number` inside one transaction (the client sends the final
  order); no separate reorder RPC.

`grant select on public.elder_profiles, public.emergency_numbers to authenticated` (RLS scopes
rows); `revoke all` from `public`/`anon`; `grant execute` on the four RPCs to `authenticated` only.

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
3. pgTAP: each of the four RPCs rejects an elder, a family member and an unrelated account with
   `insufficient_privilege` or `42501`.
4. pgTAP: `upsert_emergency_number` rejects a missing label, an empty/invalid phone and a missing
   priority.
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
    timestamp, and the honest partial state for active medicines; tapping a number opens the dialer.
11. Mobile: a connected family member sees the read-only data; an unrelated signed-in account sees
    the honest empty state.
12. No `Alert.alert` or system dialog anywhere in the flow; confirmations use in-app components.
13. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; the Sprint 1 pgTAP total (124) plus the new assertions pass locally and on hosted.
14. The demo runbook step is recorded: caregiver creates the profile and numbers on the installed
    app; the elder sees them; the dialer opens.

## Out of scope

- `F-04` / `F-09` family screens and the full family UI (Sprint 8); only the read policy ships here.
- Active medicines on `E-07` (Sprint 3) — documented partial state meanwhile.
- Prescriptions and evidence (Sprint 6), appointments (Sprint 7), reports (Sprint 9).
- Any reminder/notification scheduling; this sprint writes data the later sprints read.
- Migrating the local fixture data in `apps/mobile/src/fixtures/emergency.ts`; it is deleted or
  reduced to test-only synthetic fixtures.

## Open questions for the owner (each with a recommendation)

1. **Profile field set.** The docs name demographics, address, allergies, conditions, blood type,
   care instructions and doctor, but not the exact columns. *Recommendation:* the minimal set
   above (no sex/gender field — it is not in any approved document).
2. **Allergies/conditions shape.** Free text vs a coded list. *Recommendation:* free text, repeated
   back to the elder exactly; a coded list would invite interpretation the product forbids.
3. **Phone validation.** Strict E.164 vs permissive. *Recommendation:* permissive with a minimum
   digit count (old and short local numbers exist); store as entered, dial as stored.
4. **Re-authentication.** Profile and number edits are not among the four re-auth actions (consent,
   unlink, account deletion, evidence access). *Recommendation:* no re-auth for these writes; every
   change still writes an audit row. Confirm this reading.
5. **Verification semantics.** What does `Verified by caregiver` attest? *Recommendation:* the
   caregiver confirms the current label/number is correct, at that timestamp; editing a number
   clears `verified_at` and requires re-verification.
6. **Family read access timing.** Ship the read policy now or wait for Sprint 8.
   *Recommendation:* ship now (one policy, matches `00-product-flow.md` §2) with no family UI.
7. **Local emergency-service verification.** Product flow §8 requires the caregiver to verify the
   local emergency-service details for the elder's region. *Recommendation:* the emergency-service
   row must be `verified_at` once before `E-07` treats the list as complete; no external validation.
8. **Unlinked elder.** *Recommendation:* no profile row exists until the manager creates it; the
   elderly screen shows an honest empty state, never blank fields.

## Risks

- **Elder confusion from a list.** ADR-004 keeps one dominant action for this reason; the ordered
  list must sit behind a disclosure and never compete with the Call button.
- **Verification drift.** If edits do not clear `verified_at`, the elder can trust a stale number;
  acceptance criterion 6 plus the clearing rule in open question 5 protect this.
- **Policy reuse.** `can_view_profile` behaviour must be asserted in pgTAP, not assumed, so adding
  the family read policy cannot widen access silently.
- **Copy drift.** Every string must be traced to the UI standard; inventing labels is a defect.
- **Scope creep.** `E-07` will tempt a medicines section; it stays out until Sprint 3 ships real
  data.
