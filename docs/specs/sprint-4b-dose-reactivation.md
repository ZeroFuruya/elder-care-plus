# Sprint 4b — Restore future doses on medicine reactivation

- **Status:** **Draft v1 (2026-10-06). Not implemented; awaiting owner approval.** Raised by the owner
  on 2026-10-06 as a latent Sprint 4/Sprint 5 gap found during Sprint 7 work.
- **Flow:** `docs/00-product-flow.md` §7 hard rule "never hard-delete medical history — deactivate or
  archive with timestamps" and the medication lifecycle (`medication.deactivated` /
  `medication.reactivated`).
- **Depends on:** Sprint 3 (`set_medication_active`, `generate_dose_events_for`,
  `local_dose_timestamp`), Sprint 4 (`cancel_future_dose_events`,
  `reconcile_dose_events_for_medication`), Sprint 5 (`cancel_reason`, the suppression/resume step 0).
- **Supersedes:** nothing. It is a bug fix, not a feature sprint. It adds **no** new screen, table,
  column, RPC or grant.

## Owner decision (binding, 2026-10-06)

- **OD1 — fix, don't redesign.** The owner elected to treat the reactivation gap as a defect in the
  existing dose-generation lifecycle and fix it in the reconciliation path, with a regression test.
  No new user-facing flow, no change to how a caregiver deactivates or reactivates a medicine.

## Problem

1. **Deactivation.** `set_medication_active(p_id, false)` stamps `is_active = false` and
   `deactivated_at`. The `medications_reconcile_dose_events` trigger then runs
   `reconcile_dose_events_for_medication`, whose **step 1** cancels every future, un-taken,
   un-missed occurrence with `cancel_reason = 'plan_deactivated'`
   (`20261022120000_sprint5_inventory_expiry.sql`, step 1, `case` at line 251).
2. **Reactivation.** `set_medication_active(p_id, true)` sets `is_active = true` and
   `deactivated_at = null` (`20261008120000_sprint3_medications.sql`, lines 486–501). The same trigger
   runs reconciliation again, but:
   - **step 0** reopens only `cancel_reason = 'batch_invalid'` occurrences, never `plan_deactivated`;
   - **step 1** only *cancels* rows where `cancelled_at is null`, so the already-cancelled
     `plan_deactivated` rows are left untouched;
   - **step 3** calls `generate_dose_events_for`, which keeps `(schedule_id, scheduled_at)` as its
     idempotency anchor and **does not reopen a cancelled row**, so the anchor already exists and
     nothing is regenerated.
3. **Result.** A reactivated medicine has **no future doses**. The elder's reminder list and the
   caregiver's due list stay empty for it until a schedule edit happens to change an anchor time.
   This is a data-correctness defect, not a cosmetic one.

## Goal

Reactivating a medicine must restore the same future occurrences the plan would have produced, while
still honouring the Sprint 5 suppression rule (a medicine with an invalid batch stays suppressed) and
without ever resurrecting a dose that was taken, missed, or deliberately cancelled for a schedule
change.

## Acceptance criteria

1. Deactivate a medicine, then reactivate it: every future, un-taken occurrence that still matches the
   **current active schedule** (same day-of-week and same `local_dose_timestamp`) is **reopened**
   (`cancelled_at = null`, `cancel_reason = null`) and therefore reappears in the elder's reminder and
   the caregiver's due list.
2. Occurrences that no longer match the current schedule (a schedule time or day changed while the
   plan was inactive) stay cancelled as `plan_deactivated`; reconciliation's existing steps then
   generate the correct replacement occurrences for the new schedule. No duplicate occurrence is ever
   created for the same `(schedule_id, scheduled_at)`.
3. An occurrence that was **taken** or **missed** is never reopened, and a `schedule_changed` or
   `batch_invalid` cancellation is unaffected by this change.
4. A reactivated medicine with **no valid active batch** stays suppressed: occurrences cancelled
   `batch_invalid` stay cancelled and future `plan_deactivated` rows are not resurrected while
   `medicine_suppresses_doses()` is true. When a valid batch is later added, the existing step-0
   resume path brings them back exactly as it does today.
5. Reactivation is still idempotent and still audit-logged: `set_medication_active` writes one
   `medication.reactivated` `audit_events` row on a real transition and none on a no-op.
6. The operation is safe to run inside the `medications` trigger: it touches only future occurrences of
   the one medication and terminates (no recursion — reconciliation does not write `medications`).

## Data touched

### Migration `supabase/migrations/<new>_sprint4b_dose_reactivation.sql`

`create or replace function public.reconcile_dose_events_for_medication(p_medication_id uuid)`. The
only change is inside the **non-suppressed branch of step 0**: in addition to reopening future
`batch_invalid` rows, reopen future `plan_deactivated` rows **that still match the current active
plan and schedule**, with the same guard set already used by step 1's "survives" test:

```
update public.dose_events d
   set cancelled_at = null, cancel_reason = null
  from public.medications m, public.medication_schedules s
 where d.medication_id = p_medication_id
   and m.id = d.medication_id
   and s.id = d.schedule_id
   and d.cancelled_at is not null
   and d.cancel_reason = 'plan_deactivated'
   and d.taken_at is null
   and d.missed_at is null
   and d.scheduled_at > now()
   and m.is_active
   and s.is_active
   and extract(dow from d.scheduled_local_date)::smallint = any (s.days_of_week)
   and d.scheduled_at = public.local_dose_timestamp(d.scheduled_local_date, s.time_of_day, s.timezone);
```

No new schema, grant, policy, RPC or screen. The function stays `security definer`,
`set search_path = public, pg_temp`, and keeps its existing comment (updated to name plan reactivation).

## Tests — `supabase/tests/sprint4b_dose_reactivation.test.sql` (pgTAP)

Following the existing dose-lifecycle test style (fixtures via the seeded synthetic profiles, `set_config`
of a manager JWT, RPC calls, and direct table assertions):

1. Deactivate a medicine with a future occurrence, reactivate it → the occurrence is reopened (assert
   `cancelled_at is null`, `cancel_reason is null`) and the count of future un-cancelled occurrences
   returns to the pre-deactivation value.
2. Reactivate after a schedule time change while inactive → the stale occurrence stays cancelled, the
   new schedule's occurrence exists, and no `(schedule_id, scheduled_at)` pair is duplicated.
3. Reopen never touches a `taken_at`/`missed_at` row and never touches a `schedule_changed` row.
4. Suppressed reactivation: reactivate a medicine whose only batch is expired → future occurrences
   stay cancelled and are not reopened; add a valid batch → step 0 resumes them (existing Sprint 5
   behaviour, now asserted with a reactivation in the mix).
5. Audit: a real reactivation writes exactly one `medication.reactivated` row; a second reactivation of
   an already-active medicine is a no-op with no new audit row.

## Out of scope

- Any change to `set_medication_active`'s validation, audit or signature.
- Any UI change: the "Reactivate" affordance on `C-04` already works; this fix makes the data follow.
- Backfilling occurrences outside the generation window (`current_date` … `+ 3`); reconciliation's
  existing generation step keeps that boundary.
- The Sprint 5 `medicine_suppresses_doses` semantics.

## Risk / blast radius

- The function is a hot path (every medication, schedule and batch write triggers it) and is
  `security definer`. The change adds one bounded `UPDATE` inside the branch that already runs two
  `UPDATE`s, scoped by `medication_id` and `scheduled_at > now()`; it cannot widen RLS or grant access.
- Existing pgTAP suites for Sprints 3–5 already exercise deactivate/reactivate indirectly; the full
  suite must stay green (**496/496** baseline) plus the new file.
- Hosted push follows the usual rule: fresh `backup.sql`, then `npx supabase db push`.
