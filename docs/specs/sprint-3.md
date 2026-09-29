# Sprint 3 — Medication and inventory setup (Flow B)

- **Status:** Draft for owner approval, written 2026-09-29 at the owner's request and planned with
  `@architect` (2026-09-29). Revised the same day to fold in the `@architect` critique: restrictive
  foreign keys, the "no active medication without a valid schedule" rule, schedule/timezone
  validation, the expired-batch rule, server-derived manager checks and locks, the per-RPC audit
  contract, blank/numeric validation and normative Sprint 4 hand-off keys. Implementation has not
  started. Sprint 1b removed the local "Add a medicine" form; this spec restores that flow against
  Supabase.
- **Branch:** `sprint-3-medication-setup`.
- **Flow:** `docs/00-product-flow.md` §4 B (medication, inventory and expiry setup), §7 data model,
  §8 validation.
- **Depends on:** Sprint 1 accepted, Sprint 1b merged (Supabase identity, active care link), and
  Sprint 2's `elder_profiles` link available. Feeds Sprint 4, which generates dose occurrences from
  the schedules created here.

## Goal

Give the caregiver a real Supabase-backed medication setup: create a medicine, add one or more
schedules, and optionally add a stock batch, then see them in the medication list and detail
screens. The elder and any active family member read the same plan read-only. Nothing here
generates reminders or confirmations yet — this sprint produces the data **and the normative
database contracts** Sprint 4 needs.

The visible result: `C-02` lists the elder's active medicines with an honest empty state; `C-03`
adds or edits a medicine, its schedules and a batch with validation; `C-04` shows the plan and
stock state read-only. The legacy SQLite medication modules stay unreachable for writes.

## User stories

1. As a caregiver manager, I can create a medicine with name, strength/form, dose quantity and
   unit, instructions, start/end dates, one or more repeat day/time schedules, and a missed-dose
   grace period.
2. As a caregiver manager, I can optionally add a stock batch with quantity and matching unit, lot
   number, expiry date, low-stock threshold and refill contact, and choose the active batch.
3. As a caregiver manager, I am warned when an active medicine name or schedule duplicates an
   existing one, and I am never told whether two medicines interact.
4. As a caregiver manager, I can edit or deactivate a medicine, schedule or batch; history is never
   deleted and past events stay immutable.
5. As an elder or connected family member, I can read the medication plan and stock state, with no
   edit affordance.
6. As an unrelated account, I can neither read nor write anything.
7. As the owner, I can prove the schedules are exactly what Sprint 4's dose generation will read.

## Screens

- **`C-02` Medication List** — the elder's medicines with name, strength/form, dose and stock state
  (from `stockStatusPresentation`: `normal`, `low`, `out` in this sprint; `expiring`, `expired`,
  `needs_review` arrive with Sprint 5). Honest empty state when the elder has no medicines.
  Caregiver entry point to add a medicine; elder and family see the same list read-only.
- **`C-03` Add / Edit Medication** — the form: name, strength/form, dose quantity + unit,
  instructions, start/end dates, repeat days and times, grace period (default 30 minutes, allowed
  5–120 in 5-minute steps), optional batch section. Required-field inline errors, label above
  field, 48 dp targets. A medication is saved as a **draft** until it has at least one active
  schedule, then activated (the app presents this as one form; the activation rule is enforced at
  the database).
- **`C-04` Medication Detail** — medicine, schedules, batch/stock state, active flag; caregiver edit
  and deactivate actions; read-only for the elder and family. The Sprint 4 dose list will be added
  here later; show the documented partial state meanwhile.

Frame IDs must appear verbatim in component names, comments and tests (UI standard §8.4). Exact
copy comes from `docs/02-ui-ux-standard.md` §10/§13; every rendered string and interactive
`accessibilityLabel` is traced to the UI standard, and the standard loading/error/empty states and
app-bar notification bell apply. No string is invented. The duplicate warning is informational only
and never blocks the save.

## Data touched

### Migration `supabase/migrations/20261008120000_sprint3_medications.sql`

All foreign keys are `on delete restrict`; records are deactivated/archived, never hard-deleted.

`public.medications`:

- `id uuid primary key default gen_random_uuid()`, `elder_id uuid not null references public.profiles(id) on delete restrict`.
- `name text not null`, `strength text not null`, `form text` (tablet/capsule/liquid/other).
- `dose_quantity numeric(10,3) not null check (dose_quantity > 0)`, `dose_unit text not null`.
- `instructions text not null`.
- `start_date date not null`, `end_date date`; check `end_date is null or end_date >= start_date`.
- `is_active boolean not null default false`, `deactivated_at timestamptz`.
- `created_by uuid references public.profiles(id)`, `created_at`, `updated_at`.
- Blank-text guard: `name`, `strength`, `dose_unit`, `instructions` reject whitespace-only values.

`public.medication_schedules`:

- `id uuid primary key default gen_random_uuid()`, `medication_id uuid not null references public.medications(id) on delete restrict`.
- `days_of_week smallint[] not null` — check `array_length(days_of_week, 1) >= 1` and
  `days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]`. RPCs canonicalize to sorted, de-duplicated
  values so `[1,2]` and `[2,1]` cannot coexist.
- `time_of_day time not null`.
- `timezone text not null` — validated against `pg_timezone_names`; defaults to the creator's device
  timezone at creation and is editable.
- `grace_minutes integer not null default 30 check (grace_minutes between 5 and 120)`.
- `is_active boolean not null default true`, `created_at`, `updated_at`.
- Unique `(medication_id, time_of_day, days_of_week)` so one schedule is one time slot.

`public.medicine_batches`:

- `id uuid primary key default gen_random_uuid()`, `medication_id uuid not null references public.medications(id) on delete restrict`.
- `quantity numeric(10,3) not null check (quantity >= 0)`, `unit text not null`.
- `lot_number text`, `expiry_date date not null`, `low_stock_threshold numeric(10,3)` (when present,
  `>= 0`).
- `refill_contact text`, `is_active boolean not null default false`, `created_at`, `updated_at`.
- Check `expiry_date >= created_at::date` (expiry cannot precede batch entry).
- Partial unique index: at most one active batch per medication.
- **An expired batch can never become or remain active** (product flow §8, enforced in
  `create_batch`/`set_active_batch`). Sprint 5 adds the warning windows and the `needs_review`
  state, but the basic "expired batch is not active" invariant ships here.
- The batch unit must equal the medication's `dose_unit` for Sprint 4's automatic decrement to
  apply; a mismatch is allowed as an **incomplete plan** and is surfaced as a non-clinical
  caregiver-review state on `C-03`/`C-04`, never as clinical advice.

All three tables: RLS enabled, select via `public.can_view_profile(elder_id)` (joining through
`medications` for schedules and batches) for the elder and the manager; **family members read the
narrower `family_medication_summary` view** defined by Sprint 4 (name, strength, dose and schedule
only — no free-text instructions or clinical notes), not the base tables. No direct write grants to
`authenticated`.

### RPCs (all `security definer`, `set search_path = public, pg_temp`)

Every RPC resolves the target row **server-side** and derives its elder, then requires
`is_manager_of(derived_elder_id)`; a caller-supplied id is never trusted for authorization. State
changes that touch a unique slot (`set_active_batch`, activation) take a row lock so two concurrent
calls cannot both succeed. A rejected call writes no audit row.

- `create_medication(p_elder_id uuid, p_name text, p_strength text, p_form text, p_dose_quantity numeric, p_dose_unit text, p_instructions text, p_start_date date, p_end_date date) returns uuid`
  — creates a **draft** (`is_active = false`); audit `medication.created`.
- `update_medication(p_id uuid, …same fields…) returns void` — audit `medication.updated`; affects
  future events only.
- `set_medication_active(p_id uuid, p_active boolean) returns void` — **activating requires at
  least one active schedule** (`check_violation` otherwise); deactivate/reactivate with timestamps;
  audit `medication.deactivated` / `medication.reactivated`.
- `create_schedule(p_medication_id uuid, p_days_of_week smallint[], p_time_of_day time, p_timezone text, p_grace_minutes integer) returns uuid`; `update_schedule(p_id uuid, …)`, `set_schedule_active(p_id uuid, p_active boolean)` — canonicalize/validate days and timezone; audits
  `schedule.created` / `schedule.updated` / `schedule.deactivated`. On a schedule change, future
  not-yet-due generated occurrences are cancelled (never deleted) and regenerated by Sprint 4; past
  occurrences are untouched.
- `create_batch(p_medication_id uuid, p_quantity numeric, p_unit text, p_lot_number text, p_expiry_date date, p_low_stock_threshold numeric, p_refill_contact text, p_make_active boolean) returns uuid`; `update_batch(p_id uuid, …)`, `set_active_batch(p_batch_id uuid)` — reject an expired
  batch becoming active, lock the active-slot change, auto-deactivate the previous active batch;
  audits `batch.created` / `batch.updated` / `batch.activated`.

**Audit contract:** each successful state change writes exactly one `audit_events` row with the
documented action string, `target_table` (`medications` / `medication_schedules` / `medicine_batches`),
`target_id` and an `after_summary` (and `before_summary` on updates). Activating a new batch records
the new batch as the target and the previous batch id in the summary. A no-op idempotent call writes
no audit row.

`grant select` on the three tables to `authenticated`; `revoke all` from `public`/`anon`;
`grant execute` on the RPCs to `authenticated` only.

### Normative Sprint 4 hand-off (locked here, not left to Sprint 4)

These are binding contracts, because Sprint 4's idempotency depends on them:

- A schedule's local occurrence is `(local_date, time_of_day)` in its stored IANA timezone,
  converted to a UTC instant with `(local_date + time_of_day) AT TIME ZONE schedule.timezone`.
- `dose_events` is unique on **`(schedule_id, scheduled_at)`** (UTC). That pair is the database-level
  idempotency anchor; generation is `insert … on conflict (schedule_id, scheduled_at) do nothing`.
- Generated `dose_events` snapshot `dose_quantity`, `dose_unit` and `grace_minutes` at generation
  time so later edits cannot rewrite history.
- Medicine, schedule and batch edits affect **future occurrences only**; historical events are
  immutable.
- Dose generation reads only active medications that have at least one active schedule; the
  "no active medication without an active schedule" rule guarantees a referenceable plan.
- Automatic stock decrement requires an exact batch-unit/dose-unit match and a valid active batch;
  otherwise Sprint 4 records the confirmation with no decrement and a caregiver-review reason.

### Shared package

- New `packages/shared/src/medication.ts`: `doseUnitSchema` (the supported unit list),
  medication/schedule/batch zod schemas, `graceMinutesSchema` (5–120, step 5),
  `canonicalizeDaysOfWeek()`, and `stockStatusFromBatch(quantity, threshold, expiryDate, hasValidActiveBatch)` returning the existing `StockStatus` for the simple cases. Any new status must
  ship with a `status-presentation.ts` entry and tests.

## Acceptance criteria

1. pgTAP: an unrelated account selects zero rows; the manager, elder and active family member
   select exactly the linked elder's medicines, schedules and batches.
2. pgTAP: direct writes to all three tables from `authenticated` are rejected with `42501`.
3. pgTAP: every setup RPC rejects an elder, a family member and an unrelated account, and a manager
   of another elder (cross-elder IDOR); rejected calls write no audit row.
4. pgTAP: `create_medication` rejects a missing name, instructions, dose quantity/unit, an
   `end_date` before `start_date`, and whitespace-only required text.
5. pgTAP: a medication cannot be activated without at least one active schedule, and a medication
   created by `create_medication` is inactive until then.
6. pgTAP: `create_batch` rejects an expiry before the entry date, a negative quantity or threshold,
   and a second active batch on the same medicine; `set_active_batch` moves the active flag in one
   locked call and rejects an expired batch.
7. pgTAP: `create_schedule` rejects an empty `days_of_week`, an out-of-range value, an unsorted or
   duplicated array that canonicalizes to an existing slot, a grace outside 5–120, and an invalid
   timezone; an equivalent reordered array is accepted (canonicalized).
8. pgTAP: deactivating a medicine/schedule/batch keeps the row and sets `is_active = false`; a new
   active row for the same slot then succeeds; a schedule edit cancels future not-yet-due
   occurrences without deleting them.
9. pgTAP: every write RPC writes exactly one `audit_events` row with the documented action string,
   target and summaries; a no-op or rejected call writes none.
10. pgTAP: two concurrent `set_active_batch` calls cannot leave two active batches.
11. Shared unit tests: the zod schemas, `canonicalizeDaysOfWeek` and `stockStatusFromBatch` cover
    valid and invalid synthetic input, including blank strings, reordered day arrays and the
    unit-mismatch case.
12. Mobile: `C-03` validates required fields inline, enforces the grace range in 5-minute steps,
    shows the non-blocking duplicate warning, and never renders interaction advice; `C-02`/`C-04`
    render read-only for the elder and family.
13. Mobile: the caregiver can create a medicine + schedule + batch end-to-end and see it in `C-02`
    and `C-04`; the elder sees the same read-only; each screen component names its frame ID and its
    strings/labels trace to the UI standard, with 360 dp and 200% font-scale passes.
14. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; all pgTAP assertions pass locally and on hosted.
15. The legacy SQLite medication write path stays unreachable; no local row can create or change
    medication data.

## Out of scope

- Dose generation, confirmation, missed doses, notifications and the offline queue (Sprint 4).
- Expiry **warning windows** (30/14/7/1 days), low-stock alerts, the full `needs_review`
  suppression state and manual stock adjustments with a reason (Sprint 5). The expiry-can't-be-active
  invariant and the simple stock state ship here.
- Prescriptions and linking a medicine to one (Sprint 6); appointments (Sprint 7); reports (Sprint 9).
- Deleting the legacy SQLite modules — deferred to the Sprint 4 cleanup when their replacements
  exist.

## Open questions for the owner (each with a recommendation)

1. **Repeat-days storage.** `smallint[]` vs separate rows per weekday vs a bitmask.
   *Recommendation:* `smallint[]` with canonicalization and the checks above; one row per scheduled
   time.
2. **Timezone validation.** *Recommendation:* reject names not in `pg_timezone_names`; document that
   occurrence conversion follows the stored zone with a fixed DST policy (Sprint 4).
3. **Draft → active flow.** *Recommendation:* the database enforces "active only with an active
   schedule"; the app saves the whole form in one step and activates at the end.
4. **Dose unit list.** *Recommendation:* a small fixed list in `packages/shared` (for example
   tablet, capsule, ml, mg, drop, puff, sachet, unit) plus an explicit "other" that still carries a
   unit string; auto-decrement only on an exact match.
5. **Unit mismatch.** Warn and store, or block. *Recommendation:* warn and store as an incomplete
   plan; Sprint 4 never decrements silently and shows a non-clinical caregiver-review reason.
6. **Duplicate warning scope.** Name only, or name + schedule. *Recommendation:* both, phrased as
   "already on this elder's plan", never as an interaction judgement.
7. **Editing a medicine's dose after doses exist.** *Recommendation:* edits apply to future events
   only; the generated `dose_events` snapshot the dose and grace values.
8. **Threshold/quantity relationship.** *Recommendation:* require `low_stock_threshold >= 0` only;
   do not force it below the current quantity (a restock legitimately exceeds it).
9. **Who may read an elder's plan.** *Recommendation:* the elder, the manager and active family
   members, matching `00-product-flow.md` §2 and the Sprint 2 policy (see Sprint 4's
   column-level question for family fields).

## Risks

- **Locking in the wrong schedule key.** Sprint 4 depends on `(schedule_id, scheduled_at)`; the
  normative hand-off section above makes it a binding contract.
- **Unit/decimal ambiguity.** `numeric` plus an explicit unit everywhere; a bare number is a defect.
- **Timezone/DST errors.** An invalid or wrong zone silently shifts every occurrence; validate the
  zone and test the conversion.
- **Interaction-implication wording.** The duplicate warning must never read as clinical advice.
- **Scope bleed from Sprint 5.** Stock-state display and the expired-can't-be-active rule are in;
  alert thresholds and `inventory_transactions` are not.
- **Schema duplication.** Do not recreate the legacy SQLite tables' shape; the Supabase schema is
  authoritative and the legacy modules remain unreachable.
