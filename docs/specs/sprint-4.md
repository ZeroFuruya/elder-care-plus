# Sprint 4 — Daily medication adherence (Flow C)

- **Status:** Draft for owner approval, written 2026-09-29 at the owner's request and planned with
  `@architect` (2026-09-29). Implementation has not started. This is the **2026-10-15/16 instructor
  checking deliverable of record** and the critical path for the Oct 15 checkpoint.
- **Branch:** `sprint-4-medication-adherence`.
- **Flow:** `docs/00-product-flow.md` §4 C (daily adherence), §7 data model, §8 safeguards, §9
  scenarios 2 and 8; `docs/02-ui-ux-standard.md` §6 status presentation, §9 states, §10 copy.
- **Depends on:** Sprint 1/1b accepted, Sprint 3's medication/schedule/batch schema accepted, and the
  hosted Supabase project available. Synthetic demo accounts only.
- **In-scope exception:** a minimal connected-family read-only adherence view is included by
  explicit owner decision; the full family UI remains Sprint 8.

## Goal

Prove one secure, repeatable medication transaction end to end:

1. A caregiver-created schedule produces one due dose occurrence.
2. The elder sees the dose and presses `Mark as taken` once.
3. Supabase records exactly one `taken_at` timestamp.
4. The matching active batch is decremented atomically once (only when units match), with exactly
   one `inventory_transactions` row.
5. Exactly one `audit_events` row and one caregiver `notifications` row are created.
6. The caregiver sees the confirmation in the app; the family member sees a read-only summary.
7. An offline confirmation shows a persistent, non-blocking `Pending sync` and retries safely.
8. A dose not confirmed by its grace period becomes `missed` once, with one needs-attention
   notification; history is never altered to hide a miss.

The instructor's checking cycle is exactly steps 1–6, demonstrated on the installed preview APK
against the hosted project, with no browser or system dialogs — every message is in-app.

## User stories

1. As an elder, I can see today's doses with `Upcoming`, `Due now`, `Taken` or `Missed`.
2. As an elder, I can confirm only my own due dose, through the guarded server RPC.
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
  `Mark as taken` action at a **56 dp** target, shown only while the dose is `due`; after
  confirmation, the `E-04` confirmed state.
- **`E-04` Confirmed** — shows `Taken`; copy `This action cannot create a duplicate confirmation.`
- **`V-03` Offline / Pending Sync** — non-blocking banner `Pending sync`; copy
  `Do not tap again. ElderCare+ prevents duplicate dose events.`
- **`C-01` Caregiver Dashboard / Activity** — recent confirmations and missed doses with timestamps,
  stock effect and an in-app notification entry.
- **`C-05` Missed Dose Detail** — read-only missed state; copy
  `ElderCare+ does not advise whether a late dose should be taken.`
- **`S-01` Notification Center** — `Unread` / `Read`, `Mark all read`, tap to open the related
  record; in-app only, no messaging.
- **Family adherence view** — the `(family)` shell shows the linked elder's today summary (taken,
  due, missed counts, next due) and recent doses, read-only; no control is ever rendered for the
  family role.

Exact copy comes from `docs/02-ui-ux-standard.md` §10; the strings above are the known required
ones. No `Alert.alert`, browser alert or system dialog is permitted anywhere.

## Data touched

### Canonical dose representation (decision)

`dose_events` **stores facts only**: `taken_at` when confirmed and `missed_at` when the grace period
lapses. `upcoming` and `due` are computed from the schedule and grace period, so a stale row can
never display the wrong state. This keeps `packages/shared/src/dose.ts` authoritative for display:
`deriveDoseStatus` gains an optional `missedAt` input (`taken` if taken; `missed` if `missed_at` is
set or the grace period has lapsed; `due`/`upcoming` otherwise), with its existing tests extended.
`taken` and `missed` are terminal.

### Migration `supabase/migrations/20261015120000_sprint4_dose_events.sql`

`public.dose_events` — unique per schedule occurrence:

- `id uuid primary key default gen_random_uuid()`.
- `schedule_id uuid not null references public.medication_schedules(id) on delete restrict`.
- `elder_id uuid not null references public.profiles(id)`, `medication_id uuid not null references public.medications(id)`.
- `scheduled_at timestamptz not null` (UTC), `scheduled_local_date date not null`.
- `dose_quantity numeric(10,3) not null`, `dose_unit text not null` — snapshotted at generation so
  later medicine edits cannot rewrite history.
- `taken_at timestamptz`, `confirmed_by uuid references public.profiles(id)`, `client_key uuid`.
- `missed_at timestamptz`.
- **Unique `(schedule_id, scheduled_at)`** — the database-level idempotency anchor.
- Partial unique index on `(elder_id, client_key)` where `client_key is not null` — an outbox retry
  maps to the same event.

`public.inventory_transactions` (the minimal decrement path needed by the checking; the rest of
Flow D is Sprint 5):

- `id uuid primary key default gen_random_uuid()`, `batch_id uuid not null references public.medicine_batches(id)`.
- `delta numeric(10,3) not null`, `reason text not null` (check, e.g. `dose_confirmed`),
  `source_dose_event_id uuid references public.dose_events(id)`, `actor_id uuid`, `created_at`.
- Append-only (no update/delete grants; an append-only trigger as on `audit_events`).

`public.notifications`:

- `id uuid primary key default gen_random_uuid()`, `recipient_id uuid not null references public.profiles(id)`.
- `event_type text not null` (check, e.g. `dose_confirmed`, `dose_missed`).
- `target_table text`, `target_id uuid`, `created_at timestamptz not null default now()`,
  `read_at timestamptz`.
- RLS: select only `recipient_id = auth.uid()`; the only client write is marking read through RPCs
  `mark_notifications_read(p_ids uuid[])` and `mark_all_notifications_read()`.

RLS on `dose_events`: select via `public.can_view_profile(elder_id)`; no direct write grants.
`inventory_transactions`: select via the owning batch's elder for the manager/elder/family, no
client writes. `notifications`: recipient-only select and read-state RPCs.

### RPCs (all `security definer`, `set search_path = public, pg_temp`)

- `public.confirm_dose(p_dose_event_id uuid, p_client_key uuid default null) returns jsonb` — the
  **elder's only write**. Requires `is_elder_self(elder_id)`.
  - Attempts a single conditional update: `set taken_at = now(), confirmed_by = auth.uid(),
    client_key = coalesce(client_key, p_client_key)` where `id = p_dose_event_id and elder_id =
    auth.uid() and taken_at is null and missed_at is null`.
  - **When it updates one row:** if the elder has an active batch whose `unit` equals
    `dose_quantity`'s unit and `quantity >= dose_quantity`, decrement it and insert exactly one
    `inventory_transactions` row; write exactly one `audit_events` row (`dose.confirmed`) and one
    `notifications` row for the manager. Return `{"status":"taken","duplicate":false,…}`.
  - **When it updates no row:** return the existing state without any side effect —
    `{"status":"taken","duplicate":true, "taken_at":…}` when already confirmed, or
    `{"status":"missed"}` when missed. A retry, a double tap or a replayed outbox row is therefore
    safe by construction. Never overwrite an existing confirmation.
- `public.ensure_dose_events(p_elder_id uuid, p_from date, p_to date) returns integer` —
  materialises missing occurrences for active schedules in the window with
  `insert … on conflict (schedule_id, scheduled_at) do nothing`; callable by the elder, the manager
  and active family members for that elder (it is read-driven and side-effect-free beyond creating
  the canonical rows). Called when a dose list loads, covering the visible window.
- `public.transition_missed_doses() returns integer` — sets `missed_at` once for events past their
  grace period with `taken_at is null and missed_at is null`, writing one `audit_events` row
  (`dose.missed`) and one needs-attention `notifications` row per event. Schedule it with
  `pg_cron` every 5 minutes; `revoke execute` from `public`, `anon` and `authenticated` so only the
  job runs it.
- `mark_notifications_read(p_ids uuid[])` / `mark_all_notifications_read()` — recipient-gated.

`grant select` on the three tables to `authenticated`; `revoke all` from `public`/`anon`; `grant
execute` on `confirm_dose`, `ensure_dose_events` and the notification RPCs to `authenticated`;
`transition_missed_doses` is never client-callable.

### Client contracts

- **Offline outbox** — an Expo SQLite table (for example `dose_outbox`: `client_key`,
  `dose_event_id`, `queued_at`, `attempts`, `last_error`) which **replaces** the legacy SQLite dose
  modules. Confirming offline writes the outbox row and shows `Taken` + `Pending sync`; a flush on
  connectivity calls `confirm_dose` with the same `client_key`; a success or a `duplicate: true`
  response both clear the row.
- **Idempotency** — enforced at the DB layer by `(schedule_id, scheduled_at)` plus the conditional
  update; the client never creates dose events directly.
- **Notifications** — in-app only for this sprint; if Expo notifications are used for the local due
  reminder, the lock-screen text stays minimal (no medicine or condition name).

### Shared package

- `packages/shared/src/dose.ts`: add the optional `missedAt` input to `deriveDoseStatus` and extend
  `dose.test.ts`; no new status enum. `status-presentation.ts` already covers every dose and sync
  value. Any new status ships with its presentation entry and tests.

## Acceptance criteria

1. pgTAP: `confirm_dose` called twice with the same event produces exactly one `taken_at`, exactly
   one `inventory_transactions` row, exactly one `audit_events` row and exactly one `notifications`
   row; the second call returns `duplicate: true` and changes nothing.
2. pgTAP: a different elder's account cannot confirm another elder's dose (rejected), and an
   unrelated account is rejected.
3. pgTAP: confirming a dose already `missed` records no `taken_at` and no stock change.
4. pgTAP: when the active batch unit differs from the dose unit, the confirmation succeeds but no
   stock is decremented and no `inventory_transactions` row is written.
5. pgTAP: when the active batch quantity is below the dose quantity, the confirmation succeeds and
   stock is not driven negative; the event is recorded for the caregiver to review.
6. pgTAP: `ensure_dose_events` run twice for the same window creates no duplicate occurrence; the
   `(schedule_id, scheduled_at)` unique constraint is exercised.
7. pgTAP: `transition_missed_doses` sets `missed_at` once and writes one audit and one notification
   per event; a second run is a no-op; `authenticated` cannot execute it.
8. pgTAP: an unrelated account sees no `dose_events`, no `inventory_transactions` and no
   notifications; a family member sees only care-linked rows and can update nothing; a recipient can
   mark only their own notifications read.
9. pgTAP: direct inserts/updates to `dose_events`, `inventory_transactions` and `notifications` from
   `authenticated` are rejected with `42501`.
10. Shared unit tests: `deriveDoseStatus` returns `taken`, `missed` (from `missedAt` and from the
    lapsed grace period), `due` and `upcoming` across the boundary cases.
11. Mobile: the elder confirms once and sees `Taken`; a simulated offline confirmation shows
    `Pending sync`, then syncs once on reconnect with no duplicate; the copy `Do not tap again.
    ElderCare+ prevents duplicate dose events.` appears in the pending state.
12. Mobile: `Mark as taken` is a 56 dp target, shown only while `due`; the missed state shows `C-05`
    copy and no confirmation action.
13. Mobile: the caregiver sees the confirmation, timestamp, stock effect and an unread in-app
    notification; `S-01` marks read and opens the record.
14. Mobile: the family shell shows a read-only summary with no management control; a negative test
    shows family calls to `confirm_dose` and the Sprint 3 RPCs are rejected.
15. Checkpoint demo: on the installed preview APK against hosted, one full cycle is demonstrated —
    caregiver sets up medicine + schedule + batch, a due dose reaches the elder, the elder confirms
    once, and the caregiver sees the confirmation, the decremented stock and the in-app
    notification.
16. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm check:contrast` stay
    green; the full pgTAP suite (Sprint 1's 124 plus Sprints 2–4) passes locally and on hosted.

## Out of scope

- Expiry windows, low-stock alerts, `needs_review` suppression and manual stock adjustments with a
  reason (Sprint 5); this sprint ships only the confirmation decrement of `inventory_transactions`.
- Prescriptions and evidence (Sprint 6), appointments (Sprint 7), the full family UI — care circle,
  help requests, availability (Sprint 8), reports, audit trail viewer, embeddings, offline-sync
  hardening (Sprint 9).
- An audited dose-correction flow: `taken`/`missed` are terminal; any correction workflow is a later
  spec with its own migration and audit rules.
- Push-notification delivery: in-app notifications are the deliverable; local reminders may use Expo
  Notifications but are not acceptance-critical.
- Deleting the legacy SQLite modules: this sprint replaces their behaviour and removes the last
  reachable read; file deletion happens with the same cleanup.

## Open questions for the owner (each with a recommendation)

1. **Is `pg_cron` available on the hosted Free project?** *Recommendation:* verify it early (an
   owner prerequisite). If it is not, fall back to running `transition_missed_doses` from an
   authenticated client load path plus a documented limitation, rather than claiming the missed
   transition is scheduled.
2. **Persisted `missed_at` vs computed-only status.** *Recommendation:* persist `missed_at` (it makes
   the single notification and terminal state provable) and extend the shared `deriveDoseStatus`
   rather than adding a separate status column.
3. **Confirmation window.** Can the elder confirm a dose after the grace period? *Recommendation:*
   no — after `missed` the screen shows `C-05` copy and no action; a late confirmation correction is
   a future audited flow.
4. **Elder timezone vs schedule timezone.** *Recommendation:* generate with the schedule's stored
   IANA timezone, store `scheduled_at` in UTC, and show local time on screen.
5. **Notification retention.** *Recommendation:* keep all notifications; mark read, never delete
   (consistent with the no-hard-delete rule).
6. **Family summary scope.** Which fields may the family see? *Recommendation:* counts by status,
   the medication name, the scheduled time and the taken/missed timestamp only — never instructions
   or clinical notes.
7. **Outbox storage.** Expo SQLite vs SecureStore. *Recommendation:* Expo SQLite (the app already
   has it; the payload is not a secret).
8. **Demo data provisioning.** *Recommendation:* a documented, repeatable in-app setup on the demo
   accounts (same approach as the Sprint 1b runbook); no seed file committed with real data.

## Risks

- **Double decrement or duplicate timestamp.** The whole sprint is judged on this; `pgTAP` criteria
  1–6 and the conditional-update design must be reviewed by `@challenger` before merge.
- **Cron reliability.** A missed cron run delays a missed-dose notification; the transition is
  idempotent, so a late run still records correctly, but the demo must not depend on a cron tick.
- **Clock skew / timezone errors** can mark a dose due or missed early. Generate and display from the
  stored timezone; test the boundary cases.
- **Family data leakage.** The family view is new surface; negative tests must prove read-only and
  care-link-scoped access.
- **Notification noise.** One notification per event, never one per retry; the conditional update
  makes that true by construction.
- **Legacy SQLite confusion.** The old dose modules must be unreachable; any remaining local write
  path is a defect.
