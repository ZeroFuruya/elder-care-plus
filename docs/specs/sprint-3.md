# Sprint 3 — Medication and inventory setup (Flow B)

- **Status:** Draft for owner approval, written 2026-09-29 at the owner's request and planned with
  `@architect` (2026-09-29). Implementation has not started. Sprint 1b removed the local
  "Add a medicine" form; this spec restores that flow against Supabase.
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
generates reminders or confirmations yet — this sprint produces the data and the database contracts
Sprint 4 needs.

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
  field, 48 dp targets.
- **`C-04` Medication Detail** — medicine, schedules, batch/stock state, active flag; caregiver edit
  and deactivate actions; read-only for the elder and family. The Sprint 4 dose list will be added
  here later; show the documented partial state meanwhile.

Exact copy comes from `docs/02-ui-ux-standard.md` §10/§13; no string is invented. The duplicate
warning is informational only and never blocks the save.

## Data touched

### Migration `supabase/migrations/20261008120000_sprint3_medications.sql`

`public.medications`:

- `id uuid primary key default gen_random_uuid()`, `elder_id uuid not null references public.profiles(id) on delete cascade`.
- `name text not null`, `strength text not null`, `form text` (tablet/capsule/liquid/other).
- `dose_quantity numeric(10,3) not null check (dose_quantity > 0)`, `dose_unit text not null`.
- `instructions text not null`.
- `start_date date not null`, `end_date date`; check `end_date is null or end_date >= start_date`.
- `is_active boolean not null default true`, `deactivated_at timestamptz`.
- `created_by uuid references public.profiles(id)`, `created_at`, `updated_at`.

`public.medication_schedules`:

- `id uuid primary key default gen_random_uuid()`, `medication_id uuid not null references public.medications(id) on delete cascade`.
- `days_of_week smallint[] not null` (0 = Sunday … 6 = Saturday, unique, sorted), `time_of_day time not null`.
- `timezone text not null` (IANA name; defaults to the creator's device timezone at creation).
- `grace_minutes integer not null default 30 check (grace_minutes between 5 and 120)`.
- `is_active boolean not null default true`, `created_at`, `updated_at`.
- Unique `(medication_id, time_of_day, days_of_week)` so one schedule is one time slot; the form
  creates one row per time.

`public.medicine_batches`:

- `id uuid primary key default gen_random_uuid()`, `medication_id uuid not null references public.medications(id) on delete cascade`.
- `quantity numeric(10,3) not null check (quantity >= 0)`, `unit text not null`.
- `lot_number text`, `expiry_date date not null`, `low_stock_threshold numeric(10,3)`.
- `refill_contact text`, `is_active boolean not null default false`, `created_at`, `updated_at`.
- Check `expiry_date >= created_at::date` (expiry cannot precede batch entry).
- Partial unique index: at most one active batch per medication.
- The unit must equal the medication's `dose_unit` for Sprint 4's automatic decrement to apply;
  a mismatch is stored but never auto-decrements (surfaced as a warning on `C-03`).

All three tables: RLS enabled, select via `public.can_view_profile(elder_id)` (joining through
`medications` for schedules and batches); no direct write grants to `authenticated`.

### RPCs (all `security definer`, `set search_path = public, pg_temp`, manager-gated)

- `create_medication(p_elder_id uuid, p_name text, p_strength text, p_form text, p_dose_quantity numeric, p_dose_unit text, p_instructions text, p_start_date date, p_end_date date) returns uuid` — audit `medication.created`.
- `update_medication(p_id uuid, …) returns void` — audit `medication.updated`; only future events are affected.
- `set_medication_active(p_id uuid, p_active boolean) returns void` — deactivate/reactivate with
  timestamps; audit `medication.deactivated` / `medication.reactivated`.
- `create_schedule(p_medication_id uuid, p_days_of_week smallint[], p_time_of_day time, p_timezone text, p_grace_minutes integer) returns uuid`; `update_schedule(...)`, `set_schedule_active(p_id uuid, p_active boolean)` — audits `schedule.created` / `schedule.updated` / `schedule.deactivated`.
- `create_batch(p_medication_id uuid, p_quantity numeric, p_unit text, p_lot_number text, p_expiry_date date, p_low_stock_threshold numeric, p_refill_contact text, p_make_active boolean) returns uuid`; `update_batch(...)`, `set_active_batch(p_batch_id uuid)` — audits `batch.created` / `batch.updated` / `batch.activated`.
- Duplicate names/schedules are detected by the client from its own read (the caregiver can read
  the plan) and shown as a non-blocking warning; the RPCs do not block and never comment on
  interactions.

`grant select` on the three tables to `authenticated`; `revoke all` from `public`/`anon`;
`grant execute` on the RPCs to `authenticated` only.

### Shared package

- New `packages/shared/src/medication.ts`: `doseUnitSchema` (the supported unit list), the
  medication/schedule/batch zod schemas, `graceMinutesSchema` (`5`–`120`, step 5), and
  `stockStatusFromBatch(quantity, threshold, expiryDate, hasValidActiveBatch)` returning the
  existing `StockStatus` for the simple cases. Any new status must ship with a
  `status-presentation.ts` entry and tests.

## Acceptance criteria

1. pgTAP: an unrelated account selects zero rows; the manager, elder and active family member
   select exactly the linked elder's medicines, schedules and batches.
2. pgTAP: direct writes to all three tables from `authenticated` are rejected with `42501`.
3. pgTAP: every setup RPC rejects an elder, a family member and an unrelated account.
4. pgTAP: `create_medication` rejects a missing name, instructions, dose quantity/unit, or an
   `end_date` before `start_date`.
5. pgTAP: `create_batch` rejects an expiry before the entry date, a negative quantity, and a second
   active batch on the same medicine; `set_active_batch` moves the active flag in one call.
6. pgTAP: `create_schedule` rejects an empty or duplicated `days_of_week`, a grace outside 5–120,
   and a duplicate `(medication_id, time_of_day, days_of_week)`.
7. pgTAP: deactivating a medicine/schedule/batch keeps the row and sets `is_active = false`; a new
   active row for the same slot then succeeds.
8. pgTAP: every write RPC writes exactly one `audit_events` row with the documented action string.
9. Shared unit tests: the zod schemas and `stockStatusFromBatch` cover valid and invalid synthetic
   input, including the unit-mismatch case.
10. Mobile: `C-03` validates required fields inline, enforces the grace range in 5-minute steps,
    shows the non-blocking duplicate warning, and never renders interaction advice; `C-02`/`C-04`
    render read-only for the elder and family.
11. Mobile: the caregiver can create a medicine + schedule + batch end-to-end and see it in `C-02`
    and `C-04`; the elder sees the same read-only.
12. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; all pgTAP assertions pass locally and on hosted.
13. The legacy SQLite medication write path stays unreachable; no local row can create or change
    medication data.

## Out of scope

- Dose generation, confirmation, missed doses, notifications and the offline queue (Sprint 4).
- `inventory_transactions`, expiry windows (30/14/7/1 days), low-stock alerts and the
  `needs_review` suppression state (Sprint 5). Sprint 3 only shows the simple stock state.
- Manual stock adjustments with a reason (Sprint 5).
- Prescriptions and linking a medicine to one (Sprint 6); appointments (Sprint 7); reports (Sprint 9).
- Deleting the legacy SQLite modules — deferred to the Sprint 4 cleanup when their replacements
  exist.

## Open questions for the owner (each with a recommendation)

1. **Repeat-days storage.** `smallint[]` vs separate rows per weekday vs a bitmask.
   *Recommendation:* `smallint[]` with a uniqueness/sort guard; one row per scheduled time.
2. **Timezone source.** Device timezone at creation vs a caregiver choice. *Recommendation:* default
   to the creator's device timezone, stored as IANA, editable on `C-03`; Sprint 4 generates in this
   timezone and stores UTC.
3. **One schedule per time vs multiple times in a row.** *Recommendation:* one row per time — it
   makes the Sprint 4 unique key `(schedule_id, scheduled_at)` unambiguous.
4. **Dose unit list.** *Recommendation:* a small fixed list in `packages/shared` (for example
   tablet, capsule, ml, mg, drop, puff, sachet, unit) plus an explicit "other" that still carries a
   unit string; auto-decrement only on an exact match.
5. **Unit mismatch.** Warn and store, or block. *Recommendation:* warn and store (a plan may exist
   before a matching batch); never decrement silently in Sprint 4.
6. **Duplicate warning scope.** Name only, or name + schedule. *Recommendation:* both, phrased as
   "already on this elder's plan", never as an interaction judgement.
7. **Editing a medicine's dose after doses exist.** *Recommendation:* edits apply to future events
   only; Sprint 4's `dose_events` snapshot the dose quantity and unit at generation time so history
   cannot change.
8. **Who may read an elder's plan.** *Recommendation:* the elder, the manager and active family
   members, matching `00-product-flow.md` §2 and the Sprint 2 policy.

## Risks

- **Locking in the wrong schedule key.** Sprint 4 depends on it; get the uniqueness constraint right
  here or dose generation will duplicate or miss occurrences.
- **Unit/decimal ambiguity.** `numeric` plus an explicit unit everywhere; a bare number is a defect.
- **Interaction-implication wording.** The duplicate warning must never read as clinical advice.
- **Scope bleed from Sprint 5.** Stock state display is fine; alert thresholds and
  `inventory_transactions` are not part of this sprint.
- **Schema duplication.** Do not recreate the legacy SQLite tables' shape; the Supabase schema is
  authoritative and the legacy modules remain unreachable.
