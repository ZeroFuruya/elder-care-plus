# Sprint 5 — Inventory and expiry safety (Flow D)

- **Status:** **Implemented and locally verified (2026-10-06).** v1 written 2026-10-05; v2 revised
  the same day after an `@architect` critique, which found that v1's suppression/resume and
  notification-dedup mechanisms could not work against the Sprint 4 code. Every must-fix is folded
  in below. The owner approved v2 and the two follow-up decisions (`No stock tracking`; prescription
  records kept as a deferred slice), and the branch is implemented. `npx supabase db reset` applies
  the migration cleanly and `npx supabase test db` is **444/444** (Sprint 5 adds 50 assertions).
  Hosted push is pending a backup.
- **Branch:** `sprint-5-inventory-expiry` (spec only so far; implementation starts on approval).
- **Flow:** `docs/00-product-flow.md` §4 D (inventory and expiry safety), §6 data model, §8 rules.
- **Depends on:** Sprint 3 (`medicine_batches`, `create_batch`/`update_batch`/`set_active_batch`/
  `deactivate_batch`, `stockStatusFromBatch`) and Sprint 4 (`dose_events`, `inventory_transactions`,
  `notifications`, the guarded `confirm_dose` decrement, `generate_dose_events_for`,
  `cancel_future_dose_events`, `reconcile_dose_events_for_medication`), both accepted and merged.
- **Successor:** none. Sprint 6 (prescriptions/evidence/OCR) is **deferred by owner decision
  2026-10-05**, so this sprint must not depend on it.

## Owner decisions (binding, 2026-10-05)

- **D1 — suppression rule.** A medicine's reminders are suppressed **only when a batch exists but no
  valid active batch remains** (the active batch is expired, or its unit does not match the dose
  unit). A medicine with **no batch at all keeps reminding** (batch stays optional). Quantity `0`
  alone **warns but does not suppress**.
- **D2 — frame IDs.** The approved wireframe pack has no stock/batch frame (C-R3). Stock is shown on
  the existing `C-04`, and the adjustment action is a **confirmation dialog**, not a new screen. No
  new frame ID may be invented.
- **D3 — AI/OCR removed.** Photo evidence, OCR and embeddings are out of the app and this
  presentation; `services/ai` is not consumed here. Plain prescription **records** (no photos, no
  OCR) remain a deferred future slice — Sprint 6 is re-scoped to records-only and deferred, not
  dropped outright. The immediate sequence is **S5 → S7 → S8 → S9**.

## Goal

Turn the stock and expiry facts the confirmation loop already records into a **safety workflow**:
warning windows before expiry, low/out-of-stock warnings, a correct `needs_review`
suppression-and-resume path, and manual stock adjustments that require a reason and leave an audit
trail. Alerts are in-app (caregiver managers only); the elder sees a plain, non-clinical
"contact your caregiver" instruction. Nothing is ever conveyed by colour alone, and the app never
suggests a substitute, a dose change, or stopping treatment.

## User stories

1. As a caregiver manager, I am warned when an active batch is 30, 14, 7 or 1 day from expiry, and
   when its quantity reaches the low-stock threshold or hits zero.
2. As a caregiver manager, I see each medicine's stock/expiry state as text + icon (never colour
   alone) and can open the batch ledger behind it.
3. As a caregiver manager, I can adjust a batch quantity after confirming the change; the app
   requires a reason and writes exactly one ledger row and one audit row.
4. As a caregiver manager, I can add or activate a replacement batch; the medicine leaves
   `needs_review` and future reminders resume once I have reviewed it.
5. As an older adult, when a medicine has a batch but no valid active batch, I see a non-clinical
   "contact your caregiver about this medicine" instruction and receive no take prompt for it.
6. As an older adult or connected family member, I can read the stock/expiry state and write
   nothing.
7. As an unrelated account, I can neither read nor write anything.

## Screens

- **`C-04` Medication Detail** (existing) — add the stock/expiry state through
  `statusPresentation` (icon + label + redundant tone), the active batch summary, a read-only
  **recent stock ledger**, and the caregiver actions **Adjust stock** and **Add replacement
  batch**. Elder and family see the same state read-only and no write affordance.
- **Adjust-stock confirmation dialog** — a confirmation-first flow naming the medicine and the
  effect, with a required **reason** and an optional **note** (UI standard §10/§12). Always writes
  an `audit_events` row. Rendered as a dialog; no new frame (D2).
- **`C-01` Dashboard / `S-01` Notifications** (existing) — stock/expiry alerts surface under
  **Needs attention** and in the notification list. The elder's equivalent is the plain-language
  instruction on their medicines/dose screens, derived on the client, never stored as an alert.

Every new rendered string and interactive `accessibilityLabel` is proposed as a traceable batch for
owner approval, as Sprint 3 did. Status copy stays non-clinical and caregiver-directed.

## Data touched

### Migration `supabase/migrations/20261022120000_sprint5_inventory_expiry.sql`

All foreign keys `on delete restrict`; nothing is hard-deleted. Widened check constraints are
replaced forward (never by editing applied history).

**A. Cancellation reasons, suppression and resume**

1. **`dose_events.cancel_reason text`** (nullable) with a check in
   `('batch_invalid', 'schedule_changed', 'plan_deactivated')`, and a consistency check that
   `cancel_reason` is null unless `cancelled_at` is not null. Existing cancelled rows stay readable
   (`cancel_reason` null), so nothing is rewritten; the new reason applies from this migration on.
2. **`cancel_future_dose_events`** (`CREATE OR REPLACE`, signature unchanged) stamps
   `cancel_reason = case when p_days is null then 'plan_deactivated' else 'schedule_changed' end`.
3. **`reconcile_dose_events_for_medication`** (`CREATE OR REPLACE`) gains a **step 0** before its
   existing steps:
   - if `medicine_suppresses_doses(p_medication_id)`: cancel future non-terminal rows
     (`taken_at is null and missed_at is null and cancelled_at is null and scheduled_at > now()`)
     with `cancel_reason = 'batch_invalid'`;
   - else: **reopen** rows where `cancelled_at is not null and cancel_reason = 'batch_invalid' and
     taken_at is null and missed_at is null and scheduled_at > now()`, setting `cancelled_at = null`
     and `cancel_reason = null`.
   Its existing schedule-mismatch step also stamps `cancel_reason` via a `CASE` (inactive
   schedule/medicine → `plan_deactivated`, otherwise `schedule_changed`). Its final regenerate step
   runs only when the medicine is active **and not suppressed**. This is the single resume path; the
   generator does not reopen rows on its own.
4. **Helpers** (all `security definer`, all revoked from every client role):
   - `medicine_has_any_batch(uuid) returns boolean`
   - `medicine_has_valid_active_batch(uuid) returns boolean` — an active batch whose `unit` equals
     the medicine's `dose_unit` and whose `expiry_date >= current_date`.
   - `medicine_suppresses_doses(uuid) returns boolean` =
     `medicine_has_any_batch(...) and not medicine_has_valid_active_batch(...)`. **Suppression is
     never inferred from the display status** (must-fix 9).
5. **`generate_dose_events_for`** (`CREATE OR REPLACE`) adds
   `and not public.medicine_suppresses_doses(m.id)` to its insert predicate. Its
   `on conflict (schedule_id, scheduled_at) do nothing` is unchanged, so the `(schedule_id,
   scheduled_at)` idempotency anchor is preserved and cancelled rows are reopened only through
   reconciliation (step 3), never resurrected by a bare insert.
6. **A batch trigger calls reconciliation.** A new `after insert or update` trigger on
   `medicine_batches` (mirroring the Sprint 4 `medications`/`medication_schedules` triggers) calls
   `reconcile_dose_events_for_medication(new.medication_id)`. Sprint 3 predates that helper, and
   batches have no such trigger today, so this wiring is new; it is what makes "add or activate a
   replacement batch → reminders resume" and "add an invalid batch → suppression" work through
   every write path.

**B. Ledger and manual adjustments**

7. **`inventory_transactions`** widens `reason` to `('dose_confirmed', 'manual_adjustment')` and
   adds `adjustment_reason text` (nullable) with a check against the owner-approved list, plus a
   pairing check: `reason <> 'manual_adjustment' or adjustment_reason is not null`.
8. **`adjust_stock(p_batch_id uuid, p_delta numeric, p_reason text, p_note text) returns uuid`**
   — `security definer`, granted to `authenticated`:
   - resolves the batch's elder server-side and requires `is_manager_of(elder)`; locks the batch
     row (`select … for update`);
   - rejects a null/non-finite/zero `p_delta`; rejects an unknown, blank or whitespace-only
     `p_reason` (fixed list, trimmed); rejects a `p_note` longer than 500 characters;
   - rejects if the batch is inactive, the medicine is inactive, or the batch is expired;
   - **rejects a resulting quantity below zero** (it does not silently clamp);
   - appends exactly one `inventory_transactions` row (`delta`, `reason = 'manual_adjustment'`,
     `adjustment_reason = p_reason`, `actor_id = auth.uid()`, `note`) and exactly one
     `audit_events` row whose summary carries reason, note, and before/after quantity;
   - a rejected call writes nothing; a no-op is impossible (`delta <> 0`).

**C. Alerts**

9. **`notifications`** widens `event_type` to add `('stock_low', 'stock_out', 'stock_expiring',
   'medicine_needs_review')`, adds `dedup_key text`, backfills existing rows with
   `dedup_key = target_id::text`, drops `notifications_event_key`, and creates a unique index on
   `(recipient_id, event_type, dedup_key)`. This keeps the Sprint 4 "one notification per event per
   recipient" guarantee while allowing a **recurring** state to alert again (must-fix 2).
10. **`medicine_alert_state`** — one row per `(medicine_id, alert_kind)`, where `alert_kind` is
    `('stock_level', 'expiry', 'suppression')`, holding `last_key text`,
    `transition_seq integer not null default 0`, `updated_at`. RLS enabled with no client policy and
    no client grant; reached only from a `security definer` function.
11. **`check_inventory_alerts() returns integer`** — server-only:
    - for each active medicine, derives three keys: `stock_level` (`normal`/`low`/`out`),
      `expiry` (`none`/`d30`/`d14`/`d7`/`d1`/`expired`, the narrowest applicable window), and
      `suppression` (`ok`/`needs_review`);
    - locks/upserts the state row, and **only when the key differs** inserts a notification for each
      active caregiver manager and increments `transition_seq`, with
      `dedup_key = medicine_id || ':' || alert_kind || ':' || transition_seq`;
    - a second run in the same state is a no-op (idempotent); the lock makes concurrent sweeps safe;
    - **elders and family members are never recipients** of inventory alerts;
    - scheduled once daily by `pg_cron` inside a `begin … exception … end` guard, so an unavailable
      scheduler degrades to a documented limitation rather than a failed migration.
12. **Grants.** `adjust_stock` → `authenticated`. `check_inventory_alerts`, the helpers,
    `medicine_alert_state` and the sweep's internals → revoked from `public`, `anon`,
    `authenticated`. `inventory_transactions` stays append-only with select-only client grants.

### Shared package

- `packages/shared/src/inventory.ts`: add `expiryWarningWindows = [30, 14, 7, 1]`,
  `expiryWindow(daysRemaining)`, and a **separate** suppression predicate
  `medicineSuppressesDoses({ hasAnyBatch, hasValidActiveBatch })` so "no batch" and "batch exists
  but invalid" are always distinguishable from the display status. Add
  `stockDisplayFromBatch(...)` returning either a `StockStatus` or the new `untracked` tracking
  state (label **`No stock tracking`**) when the medicine has no batch at all.
- `packages/shared/src/medication.ts`: keep `stockStatusFromBatch` for display, with the explicit
  precedence `expired > needs_review > out > low > expiring > normal`; the new `expiring` value is
  returned only inside a warning window and before expiry.
- `packages/shared/src/status-presentation.ts` + `status.test.ts`: every new enum value ships with
  its `{ label, icon, tone }` entry and an assertion, or `pnpm test` fails.
- Unit tests for the window boundaries, the low-stock boundary (`quantity <= threshold`), the
  out/needs-review distinction, the suppression predicate, and adjustment validation.

## Acceptance criteria

### Provable in the single-session pgTAP suite

1. **Reads/RLS.** Manager, elder and active family member read exactly the linked elder's
   `inventory_transactions`; each user reads only `notifications` addressed to them
   (`recipient_id = auth.uid()`); an unrelated account reads zero ledger and zero notification rows;
   direct writes by any client role are `42501`.
2. **`adjust_stock` authorization.** Rejects an elder, a family member, an unrelated account, and a
   manager of another elder; a rejected call writes no ledger and no audit row.
3. **`adjust_stock` validation.** Rejects zero/non-finite delta, unknown/blank reason, over-long
   note, inactive batch, inactive medicine, expired batch, and a result below zero. A valid restock
   and a valid correction each write exactly one `inventory_transactions` row
   (actor = caller, reason, `adjustment_reason`, note) and one `audit_events` row with before/after.
4. **Constraints.** The widened `reason`/`event_type`/`cancel_reason` checks accept the new values
   and still reject unknown ones; the `inventory_transactions` append-only trigger still fires.
5. **Suppression/resume.** With a batch that is expired or unit-mismatched, `ensure_dose_events`
   creates no new occurrence and reconciliation cancels future non-terminal rows as
   `batch_invalid`; taken/missed rows and rows cancelled as `schedule_changed`/`plan_deactivated`
   are untouched; a **no-batch** medicine and a valid-batch medicine at quantity `0` **do**
   generate; after a valid active batch, reconciliation reopens the `batch_invalid` rows and
   regenerates; a repeated resume is idempotent.
6. **Alerts.** A serialized second run of `check_inventory_alerts` is a no-op; a `low → normal →
   low` transition writes two notifications with increasing `transition_seq`; each expiry-window
   narrowing writes one alert; only manager recipients receive rows; `has_function_privilege`
   confirms `anon`/`authenticated` cannot execute the sweep.
7. **Shared unit tests** as listed above.

### Requires separate evidence (not claimed as single-session pgTAP)

- **Concurrency:** `adjust_stock` racing `confirm_dose`, and two sweeps in parallel — a two-session
  integration test.
- **Scheduler:** proof the `pg_cron` job exists and ran on hosted (`cron.job` /
  `cron.job_run_details`).
- **Clock:** deterministic date fixtures in SQL; a hosted, time-controlled check for a real day
  rollover.
- **Mobile/device:** `C-04` rendering, role-specific controls, the confirmation dialog,
  accessibility (48/56 dp targets), contrast, and notification navigation.

## Out of scope

- Pharmacy ordering, payments, insurance, refill automation (not in product-flow scope).
- Photo evidence, OCR and embeddings (**removed**, D3). Plain prescription records are a deferred
  future slice; Sprint 6 is re-scoped rather than started.
- Appointments (Sprint 7), the full family UI (Sprint 8), advanced reports/retrieval (Sprint 9).
- Dose correction: `taken`/`missed` stay terminal.
- A per-elder configurable warning-window UI; Sprint 5 ships the documented default set.
- Push-notification delivery; in-app notifications remain the deliverable.

## Decisions closed by the owner (2026-10-05)

1. **Adjustment reasons** are the fixed codes `restock`, `correction`, `damage`, `waste`,
   `count_adjustment`, with an optional free-text note.
2. **A no-batch medicine** shows the presentation value **`No stock tracking`** (icon + text), and
   suppression stays driven by the separate predicate.
3. **Alerts** are one daily in-app sweep; push delivery is out of scope.
4. **Warning windows** are the fixed default `[30, 14, 7, 1]`; a settings UI is deferred.

## Risks

- **Over-suppression.** Bounded by D1; the migration and its pgTAP must prove both sides (no-batch
  generating, invalid-batch suppressing) so a working plan is never silently stopped.
- **Resume depends on the batch trigger.** If the `medicine_batches` trigger is missing or the
  helper is not callable from it, reminders will not resume; the trigger and its pgTAP are
  load-bearing.
- **Cron reliability.** The sweep depends on `pg_cron`; treat an unobserved sweep as a limitation
  and keep the on-screen derivation correct regardless.
- **Append-only ledger.** Corrections are new signed rows; the UI must never imply an edit.
- **Alert noise.** The `(recipient, event_type, dedup_key)` key and the per-transition sequence
  bound it; the state keys must be chosen so flapping does not spam.
- **Copy drift.** Stock copy must stay non-clinical; the elder variant must never read as advice.
