# Sprint 4 — Daily medication adherence (Flow C)

- **Status:** Draft for owner approval, written 2026-09-29 at the owner's request and planned with
  `@architect` (2026-09-29). Revised the same day to fold in the `@challenger` review: grace and
  active-state enforced inside `confirm_dose`, an authorized and window-capped generator, atomic
  batch decrement with unique side-effect keys, server-only missed transitions, outbox terminal
  states, DST policy and a due-now checking runbook. Implementation has not started. This is the
  **2026-10-15/16 instructor checking deliverable of record**.
- **Branch:** `sprint-4-medication-adherence`.
- **Flow:** `docs/00-product-flow.md` §4 C (daily adherence), §7 data model, §8 safeguards, §9
  scenarios 2 and 8; `docs/02-ui-ux-standard.md` §6 status presentation, §9 states, §10 copy, §14
  accessibility.
- **Depends on:** Sprint 1/1b accepted, Sprint 3's medication/schedule/batch schema and its
  normative hand-off contracts accepted, and the hosted Supabase project available. Synthetic demo
  accounts only.
- **In-scope exception:** a minimal connected-family read-only adherence summary is included by
  explicit owner decision; the full family UI remains Sprint 8.

## Goal

Prove one secure, repeatable medication transaction end to end:

1. A caregiver-created schedule produces one due dose occurrence.
2. The elder sees the dose and presses `Mark as taken` once.
3. Supabase records exactly one `taken_at` timestamp.
4. The matching active batch is decremented atomically once (only when units match, the batch is
   active and unexpired, and the quantity covers the dose), with exactly one
   `inventory_transactions` row.
5. Exactly one `audit_events` row and one caregiver `notifications` row are created.
6. The caregiver sees the confirmation in the app; the family member sees a read-only summary.
7. An offline confirmation shows a persistent, non-blocking `Pending sync` and retries safely.
8. A dose not confirmed by its grace period becomes `missed` once, with one needs-attention
   notification; history is never altered to hide a miss.

The instructor's checking cycle is steps 1–6 on the installed preview APK against hosted, with no
browser or system dialogs — every message is in-app.

## User stories

1. As an elder, I can see today's doses with `Upcoming`, `Due now`, `Taken` or `Missed`.
2. As an elder, I can confirm only my own currently-due dose, through the guarded server RPC.
3. As an elder without connectivity, I can confirm a due dose and see `Pending sync`.
4. As an elder, I cannot create a duplicate confirmation by double-tapping or retrying.
5. As a caregiver, I see the confirmation, its timestamp and the resulting stock change, plus an
   in-app notification.
6. As a caregiver, I receive one needs-attention notification when a dose becomes missed, and I
   cannot silently alter history.
7. As a connected family member, I see a read-only adherence summary with no management controls.
8. As an unrelated account, I see nothing and cannot write anything.

## Screens

- **`E-01` Elder Today** — the elder's doses for today with the status label, icon and tone from
  `doseStatusPresentation`; `Upcoming · Due now · Taken · Missed` and `Synced · Pending sync`.
- **`E-03` Dose Detail** — medicine, strength, instructions, scheduled time and status, with the
  `Mark as taken` action at a **56 dp** target, shown only while the dose is `due`; the control is
  disabled synchronously on press. Its `accessibilityLabel` follows §14, for example
  `Mark as taken, Metformin 500 mg, 8:00 AM`.
- **`E-04` Confirmed** — shows `Taken`; copy `This action cannot create a duplicate confirmation.`
- **`V-03` Offline / Pending Sync** — non-blocking banner `Pending sync`; copy
  `Do not tap again. ElderCare+ prevents duplicate dose events.`
- **`C-01` Caregiver Dashboard / Activity** — recent confirmations and missed doses with timestamps,
  the stock outcome and an in-app notification entry. Refreshes via a Realtime subscription on
  `dose_events`/`notifications`, with an explicit reload fallback — the caregiver must not have to
  guess whether the confirmation arrived.
- **`C-05` Missed Dose Detail** — read-only missed state; copy
  `ElderCare+ does not advise whether a late dose should be taken.`
- **`S-01` Notification Center** — `Unread` / `Read`, `Mark all read`, tap to open the related
  record; in-app only, no messaging.
- **Family adherence summary** — the `(family)` shell shows a read-only summary from
  `family_dose_summary`: medication name, strength, scheduled time and the derived state plus
  taken/missed timestamps and counts. It never shows the free-text instructions or clinical notes,
  and renders no control.

Exact copy comes from `docs/02-ui-ux-standard.md` §10; no `Alert.alert`, browser alert or system
dialog is permitted. If Expo local reminders ship, the notification body stays minimal (no medicine
or condition name).

## Data touched

### Canonical dose representation (decision)

`dose_events` **stores facts**: `taken_at`, `missed_at` (persisted by the server) and `cancelled_at`.
`upcoming`, `due` and `missed` are otherwise derived from the schedule, the snapshotted grace period
and `now()`. `packages/shared/src/dose.ts` stays authoritative for display: `deriveDoseStatus` gains
an optional `missedAt` input (and its stale comment is updated), with the existing tests extended.
`taken` and `missed` are terminal.

### Migration `supabase/migrations/20261015120000_sprint4_dose_events.sql`

`public.dose_events` — unique per schedule occurrence:

- `id uuid primary key default gen_random_uuid()`.
- `schedule_id uuid not null references public.medication_schedules(id) on delete restrict`.
- `elder_id uuid not null references public.profiles(id) on delete restrict`,
  `medication_id uuid not null references public.medications(id) on delete restrict`.
- `scheduled_at timestamptz not null` (UTC), `scheduled_local_date date not null`.
- `dose_quantity numeric(10,3) not null`, `dose_unit text not null`, `grace_minutes smallint not null`,
  `timezone text not null` — snapshotted at generation so later edits cannot rewrite history.
- `taken_at timestamptz`, `confirmed_by uuid references public.profiles(id)`, `client_key uuid`.
- `missed_at timestamptz`, `cancelled_at timestamptz`.
- **Check `not (taken_at is not null and missed_at is not null)`** — a dose can never be both.
- **Unique `(schedule_id, scheduled_at)`** — the database-level idempotency anchor.
- `client_key` is traceability only; it carries **no** unique index (a per-scope unique key can
  block a different dose). Duplicate protection comes from the occurrence key and the confirmation
  guard.

`public.inventory_transactions` (the minimal decrement path needed by the checking; the rest of
Flow D is Sprint 5):

- `id uuid primary key default gen_random_uuid()`, `batch_id uuid not null references public.medicine_batches(id) on delete restrict`.
- `delta numeric(10,3) not null`, `reason text not null` (check, e.g. `dose_confirmed`),
  `source_dose_event_id uuid references public.dose_events(id)`, `actor_id uuid`, `created_at`.
- Append-only (no update/delete grants; an append-only trigger as on `audit_events`).
- **Partial unique index on `(source_dose_event_id)` where `reason = 'dose_confirmed'`** — a dose
  can produce at most one decrement, even across retries or overlapping jobs.

`public.notifications`:

- `id uuid primary key default gen_random_uuid()`, `recipient_id uuid not null references public.profiles(id) on delete restrict`.
- `event_type text not null` (check, e.g. `dose_confirmed`, `dose_missed`).
- `target_table text`, `target_id uuid`, `created_at timestamptz not null default now()`,
  `read_at timestamptz`.
- **Unique `(recipient_id, event_type, target_id)`** — one notification per event per recipient.
- RLS: select only `recipient_id = auth.uid()`; the only client write is marking read through RPCs
  `mark_notifications_read(p_ids uuid[])` and `mark_all_notifications_read()`.

RLS on `dose_events`: direct select via `public.can_view_profile(elder_id)` for the elder and
manager; no direct write grants. `inventory_transactions`: select via the owning batch's elder, no
client writes. `notifications`: recipient-only select and read-state RPCs. Family reads go through
the `family_dose_summary` view, which exposes only the allowed columns (see open question 6); if it
is accepted, Sprint 3's family read is narrowed to a matching `family_medication_summary` view.

### RPCs (all `security definer`, `set search_path = public, pg_temp`)

- `public.confirm_dose(p_dose_event_id uuid, p_client_key uuid default null) returns jsonb` — the
  **elder's only write**. Requires the row's `elder_id = auth.uid()` (never a caller-supplied
  elder id). It is one atomic conditional update; the due/grace/active state is part of the
  predicate, not left to the client:
  - Confirm update: `set taken_at = now(), confirmed_by = auth.uid(), client_key = coalesce(client_key, p_client_key)` where `id = p_dose_event_id and elder_id = auth.uid() and taken_at is null and missed_at is null and cancelled_at is null and scheduled_at <= now() and now() < scheduled_at + make_interval(mins => grace_minutes)`.
  - **When exactly one row updates:** decrement the matching batch with a **second atomic
    conditional update** — `set quantity = quantity - dose_quantity` where the batch is the active
    batch of that medication, `is_active`, `expiry_date >= now()::date`, `unit = dose_unit` and
    `quantity >= dose_quantity` — `RETURNING`. If it updates a row, insert exactly one
    `inventory_transactions` row; if it updates no row, **do not** insert a transaction and record
    the outcome (`no_batch`, `unit_mismatch`, `insufficient`, `inactive_or_expired`) in the audit
    summary and the response. Then write exactly one `audit_events` row (`dose.confirmed`) and, if
    the elder has a manager, exactly one `notifications` row. Return
    `{"status":"taken","duplicate":false,"stock":…}`.
  - **When no row updates:** re-read **scoped to `auth.uid()`** (`where id = p_dose_event_id and elder_id = auth.uid()`). If nothing is found, raise `42501` with the same message an unrelated caller gets (no existence leak). If `taken_at` is set, return `{"status":"taken","duplicate":true,…}` with no side effects. If `missed_at` is set, return `{"status":"missed"}`. If `cancelled_at` is set, return `{"status":"cancelled"}`. If the grace period has already lapsed, **settle the miss here** (set `missed_at = scheduled_at + grace` and write one `dose.missed` audit/notification) and return `{"status":"missed"}`. Otherwise (scheduled in the future) return `{"status":"upcoming"}` with no state change.
  - A manager-less circle must still confirm: the notification insert is 0-or-1, never a hard
    failure that rolls back `taken_at`.
- `public.ensure_dose_events(p_elder_id uuid, p_from date, p_to date) returns integer` —
  **pure generation**: creates missing occurrences with `taken_at`/`missed_at` null, using
  `insert … on conflict (schedule_id, scheduled_at) do nothing`. Authorizes `p_elder_id` as the
  elder, manager or active family member of that elder (fail closed). Caps the client window:
  `p_from >= current_date - 1`, `p_to <= current_date + 3`, span at most 4 days; a wider request is
  rejected. It never writes a notification, so it cannot be used to generate notification spam.
  Past-lapsed occurrences are created null-null and display as missed via the derived status; the
  server job (or `confirm_dose`) persists the miss and notifies once.
- `public.transition_missed_doses() returns integer` — server-only. One atomic
  `update … set missed_at = scheduled_at + make_interval(mins => grace_minutes) where taken_at is null and missed_at is null and cancelled_at is null and now() >= scheduled_at + make_interval(mins => grace_minutes) returning id, elder_id, medication_id`, then one `dose.missed` audit and one notification per returned row (the unique index makes repeats safe). `revoke execute` from `public`, `anon`, **and `authenticated`** so only the job runs it. Schedule with `pg_cron` every 5 minutes.
- `mark_notifications_read(p_ids uuid[])` / `mark_all_notifications_read()` — recipient-gated.

`grant select` on the three tables to `authenticated`; `revoke all` from `public`/`anon`; `grant
execute` on `confirm_dose`, `ensure_dose_events` and the notification RPCs to `authenticated`;
`transition_missed_doses` is **never client-callable**. All new functions start with
`revoke execute … from public, anon, authenticated` and then grant only the intended set.

### Client contracts

- **Offline outbox** — an Expo SQLite table (for example `dose_outbox`: `dose_event_id` unique,
  `client_key`, `queued_at`, `attempts`, `last_error`) which **replaces** the legacy SQLite dose
  modules. Only an existing `dose_event_id` can be queued, so a dose that was never generated
  (never loaded) cannot be confirmed offline — a documented limit, not a silent failure.
  Confirming offline writes the row and shows `Taken` + `Pending sync`; the flush calls
  `confirm_dose` with the same `client_key`. The row is cleared on `taken`, `duplicate: true`,
  **`missed`**, `cancelled`, `upcoming`, and on `42501` — every terminal outcome — and is retried
  only on a network failure.
- **Idempotency** — enforced at the DB layer by `(schedule_id, scheduled_at)`, the confirmation
  guard and the unique `(source_dose_event_id)` decrement; the client never creates dose events
  directly.
- **DST policy** — local occurrences convert with `(local_date + time_of_day) AT TIME ZONE schedule.timezone`. A nonexistent local time (spring forward) is skipped; an ambiguous one (fall back) uses the earlier offset. Windows are computed in the schedule's zone, not the device's.
- **Notifications** — in-app only for this sprint.

### Shared package

- `packages/shared/src/dose.ts`: add the optional `missedAt` input to `deriveDoseStatus`, correct the
  stale "only a confirmation is ever stored" comment, and extend `dose.test.ts`; no new status enum.
  `status-presentation.ts` already covers every dose and sync value.

## Checking runbook (the demo of record)

Run on the installed preview APK against hosted, both apps signed in, with connectivity:

1. Caregiver creates a medicine, a schedule at **demo-local now + 5 minutes** (grace 120 minutes),
   and a batch with a matching unit, an expiry in the future and quantity ≥ the dose.
2. Both apps open; `ensure_dose_events` runs for the schedule's "today"; the caregiver confirms the
   dose appears for the elder.
3. At the scheduled time the elder's `E-01`/`E-03` shows `Due now`; the elder taps `Mark as taken`
   once.
4. The caregiver's `C-01` shows `Taken`, the timestamp, the stock decreased by exactly the dose, and
   an unread notification; `S-01` marks it read.
5. Optional negative proof: a second dose left unconfirmed passes its grace and shows `Missed` with
   one notification **only if `pg_cron` is confirmed available**; otherwise the honest limitation is
   stated rather than claimed.

## Acceptance criteria

1. pgTAP: `confirm_dose` called twice for one due event produces exactly one `taken_at`, exactly one
   `inventory_transactions` row, exactly one `audit_events` row and exactly one `notifications`
   row; the second call returns `duplicate: true` and changes nothing.
2. pgTAP (concurrency): two overlapping `confirm_dose` transactions on the same event still produce
   exactly one terminal state and one set of side effects; two overlapping
   `transition_missed_doses` runs produce one `missed_at` and one notification.
3. pgTAP (due window): an `upcoming` dose (`scheduled_at > now()`), a dose already past its grace
   with `missed_at` null, and a `cancelled` dose are each **not** confirmable; the lapsed one is
   settled as `missed` and never writes `taken_at` or stock.
4. pgTAP (authorization): a manager, a family member, another elder and an unrelated account are all
   rejected; the rejection message does not reveal whether the id exists; a deactivated elder is
   rejected; `anon` cannot execute any of the RPCs.
5. pgTAP (stock): unit mismatch, no active batch, an inactive or expired batch, and
   `quantity < dose_quantity` all still record the confirmation but write **no**
   `inventory_transactions` row and no negative stock, with the reason recorded; `quantity = dose`
   leaves zero; two concurrent confirms against one batch of quantity 1 cannot go negative.
6. pgTAP (generation): `ensure_dose_events` run twice for the same window creates no duplicate; a
   caller passing another elder's id, a window wider than 4 days, or a window outside
   `[today-1, today+3]` is rejected; it writes no notifications.
7. pgTAP (missed transition): `transition_missed_doses` sets `missed_at` once and writes one audit
   and one notification per event; a second run is a no-op; `authenticated` and `anon` cannot
   execute it; a confirm in the same tick leaves exactly one terminal state.
8. pgTAP (RLS): an unrelated account sees no `dose_events`, `inventory_transactions` or
   notifications; a family member sees only the care-linked summary columns and can update nothing;
   a recipient can mark only their own notifications read.
9. pgTAP: direct inserts/updates to the three tables from `authenticated` are rejected with `42501`;
   the unique indexes on `(schedule_id, scheduled_at)`, `(source_dose_event_id)` and
   `(recipient_id, event_type, target_id)` all exist and hold.
10. pgTAP (no manager): with the caregiver link revoked, confirmation still records `taken_at`,
    stock and audit, with zero notifications, and does not roll back.
11. Shared unit tests: `deriveDoseStatus` covers `taken`, `missed` (from `missedAt` and from the
    lapsed grace), `due`, `upcoming`, the both-set guard and the boundary cases; a
    `America/New_York` spring-forward/fall-back and an `Asia/Singapore` UTC-midnight conversion test
    exist at the SQL level.
12. Mobile: the elder confirms once and sees `Taken`; a simulated offline confirmation shows
    `Pending sync`, then syncs once on reconnect with no duplicate; `V-03` shows its copy; a
    `missed` response clears the outbox and shows `C-05` with no confirmation action.
13. Mobile: `Mark as taken` is a 56 dp target with the §14 accessibility label, shown only while
    `due` and disabled synchronously on press.
14. Mobile: the caregiver sees the confirmation, timestamp, stock outcome and an unread in-app
    notification, and `S-01` marks read and opens the record; the family summary is read-only with
    no management control.
15. Mobile: no PHI appears in a local notification body; no `Alert.alert`/system dialog is used.
16. Checking runbook executed and recorded: steps 1–4 above pass on the installed APK against
    hosted.
17. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; the full pgTAP suite (Sprint 1's 124 plus Sprints 2–4) passes locally and on hosted.

## Out of scope

- Expiry **warning windows**, low-stock alerts, the full `needs_review` suppression state and
  manual stock adjustments with a reason (Sprint 5); this sprint ships only the confirmation
  decrement of `inventory_transactions`.
- Prescriptions and evidence (Sprint 6), appointments (Sprint 7), the full family UI — care circle,
  help requests, availability (Sprint 8), reports, audit trail viewer, embeddings and offline-sync
  hardening (Sprint 9).
- An audited dose-correction flow: `taken`/`missed` are terminal; any correction workflow is a later
  spec with its own migration and audit rules.
- Push-notification delivery: in-app notifications are the deliverable; local reminders may use Expo
  Notifications but are not acceptance-critical.
- Deleting the legacy SQLite modules: this sprint replaces their behaviour and removes the last
  reachable read; file deletion happens with the same cleanup.

## Open questions for the owner (each with a recommendation)

1. **Is `pg_cron` available on the hosted Free project?** *Recommendation:* verify it early (an
   owner prerequisite). If it is not, **do not** grant `transition_missed_doses` to clients under
   any fallback — showed-missed is still derived on screen and settled inside `confirm_dose`, but
   the proactive missed notification is then a documented limitation, not a claim.
2. **Persisted `missed_at` vs computed-only status.** *Recommendation:* persist `missed_at` (it makes
   the single notification and terminal state provable) and extend the shared `deriveDoseStatus`.
3. **Confirmation window.** *Recommendation (now enforced in the RPC):* only `due` doses are
   confirmable; after the grace period the screen shows `C-05` and no action.
4. **Elder timezone vs schedule timezone.** *Recommendation:* the schedule's stored IANA zone governs
   conversion; store UTC; display local time.
5. **Notification retention.** *Recommendation:* keep all notifications; mark read, never delete.
6. **Family field scope.** *Recommendation:* family reads the `family_dose_summary` (and
   `family_medication_summary`) view — name, strength, scheduled time, state, timestamps and counts
   only, never free-text instructions or clinical notes. Confirm, or choose full-plan visibility
   and the AC are replaced by row-level tests.
7. **Outbox storage.** *Recommendation:* Expo SQLite (the app already has it; the payload is not a
   secret). Note the reinstall case: an unsynced confirmation is lost locally and the server may go
   `missed` — accepted for the demo.
8. **Demo data provisioning.** *Recommendation:* the checking runbook above, executed in-app on the
   demo accounts; no seed file committed with real data.

## Risks

- **Double decrement or duplicate timestamp.** The sprint is judged on this; acceptance criteria
  1, 2, 5 and 9 and the conditional-update design must be reviewed by `@challenger` again before
  merge.
- **Cron reliability.** A missed cron run delays a missed-dose notification; the transition is
  idempotent, so a late run still records correctly.
- **Clock skew / timezone errors** can mark a dose due or missed early; the stored zone governs
  generation and display, and the boundary cases are tested.
- **Family data leakage.** The summary view is the boundary; negative tests must prove read-only and
  care-link-scoped access.
- **Notification noise.** One notification per event, never one per retry; the unique index makes
  that true by construction.
- **Legacy SQLite confusion.** The old dose modules must be unreachable; any remaining local write
  path is a defect.
