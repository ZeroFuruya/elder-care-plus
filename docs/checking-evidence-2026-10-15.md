# Checking evidence — 2026-10-15/16

Filled in during the dry-run and again at the checking. This sheet is the evidence of record for the
thesis: one complete medication-adherence transaction cycle on the installed preview APK against the
**hosted** Supabase project, plus the help-request and reports passes.

Operational script: `docs/checking-runbook-2026-10-15.md`. Do not print, commit, or send the demo
account credentials anywhere — they live in the git-ignored `apps/mobile/.env.demo-accounts`.

> Status: **skeleton — not yet filled.** Replace every `TBD` during the dry-run. Every database
> value below is **scoped to the demo IDs**; never write a table-wide count (setup and earlier runs
> leave other rows, and history is never hard-deleted).

## Build under test

| Field | Value |
|---|---|
| EAS build id | `TBD` |
| Git commit | `TBD` (record the actual HEAD the APK was built from) |
| `versionCode` | 3 |
| Package | `com.zerofuruya.eldercareplus` |
| Hosted project | `buwwkdhzansbyeytsufj.supabase.co` (18 migrations) |
| Device / Android version | `TBD` |
| Date/time of dry-run | `TBD` |

## Pre-flight

| # | Check | Expected | Observed | Pass |
|---|---|---|---|---|
| 1 | `npx supabase migration list --linked` | All 18 in sync | TBD | ☐ |
| 2 | Keep-alive workflow run | Green | TBD | ☐ |
| 3 | APK installed and launches | Launches, connects to hosted | TBD | ☐ |
| 4 | Accounts signed in (caregiver, elder, family on three devices) | Each sees only own data | TBD | ☐ |
| 5 | Care circle linked (`provision-demo-circle.mjs`) | Caregiver + family active, elder profile present | TBD | ☐ |
| 6 | Connectivity | Requests succeed | TBD | ☐ |
| 7 | Pre-demo `db dump` | File written (git-ignored) | TBD | ☐ |
| 8 | Fresh cycle state | New plan has no confirmation yet (not "table empty") | TBD | ☐ |
| 9 | `cron.job` has `transition-missed-doses` | Present or §2 is a limitation | TBD | ☐ |

## Test cases — demo of record (medication cycle)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver adds medicine + schedule (today's weekday, now + 5 min, grace 120) + batch (on, matching unit, future expiry, qty ≥ dose), activates | Plan saved and active | TBD | `TBD` |
| 2 | `ensure_dose_events` generates the dose | Dose visible on caregiver and elder | TBD | `TBD` |
| 3 | Elder pull-to-refresh until Due, then taps **Mark as taken** once | Dose shows Taken | TBD | `TBD` |
| 4 | Caregiver dashboard (pull-to-refresh) | Taken + timestamp + stock decreased by exactly the dose + unread notification | TBD | `TBD` |
| 5 | Caregiver marks notification read (`S-01`) | Unread → read, opens the related record | TBD | `TBD` |
| 6 | Family Home (read-only) | Care summary (7/30/90 range), plan + dose rows, appointments, care circle | TBD | `TBD` |

## Test cases — idempotency (headline claim; laptop, not APK)

The confirm button disappears after success, so this is proven by calling `confirm_dose` twice as the
elder's JWT (SQL/REST) against the same dose.

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | First `confirm_dose` call | `duplicate: false`, `taken_at` set once | TBD | `TBD` |
| 2 | Second `confirm_dose` call (same dose) | Returns `duplicate: true` | TBD | `TBD` |
| 3 | Re-check the database after the retry | **No** new `taken_at`, stock, inventory, audit or notification row | TBD | `TBD` |
| 4 | Name the guards | Unique dose occurrence key; one-time conditional confirmation; unique dose-decrement inventory key | TBD | — |

## Database after the run (read-only, scoped to the demo IDs)

| Table | Scoped query | Expected | Observed |
|---|---|---|---|
| `dose_events` | by demo `schedule_id` | One settled row, `taken_at` set once | TBD |
| `inventory_transactions` | by demo `source_dose_event_id` | One row, stock decremented by the dose | TBD |
| `audit_events` | `target_id = <demo-dose>` and `action = 'dose.confirmed'` | One row | TBD |
| `notifications` | `related_id = <demo-dose>` | One row, unread → read | TBD |

## Help-request cycle (Sprint 8)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Elder asks for help (category + note) | Request created; elder not notified of own ask | TBD | `TBD` |
| 2 | Circle notified | Caregiver + every active family member get in-app notification; device notification when app foregrounded with permission | TBD | `TBD` |
| 3 | First member offers to help | `open → accepted`, accepter recorded; a second member cannot claim it | TBD | `TBD` |
| 4 | Mark as done | `accepted → completed` | TBD | `TBD` |
| 5 | Member availability | Available / Not available + note shows on care circle (`F-14`) | TBD | `TBD` |

## Reports and history (Sprint 9)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver `C-09` report, 7/30/90 | Per-day count list grows with the range (7 vs 30 vs 90 rows); **no per-medicine breakdown**; totals unchanged with one dose | TBD | `TBD` |
| 2 | Caregiver `C-12` timeline | Merged audit + stock events, newest first | TBD | `TBD` |
| 3 | Elder `E-08` | Same range selector, scoped to the elder | TBD | `TBD` |
| 4 | Family `F-10` summary | Range honoured; the **report RPC payload** is counts + dates only | TBD | `TBD` |

## Negative proof (missed dose) — evidence-gated

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Leave a dose past its grace | Shows Missed (client-derived) | TBD | `TBD` |
| 2 | `pg_cron` transition | Only claim if the scheduled transition is **actually observed** (`missed_at` / notification) | TBD | `TBD` |

## Screenshot set

| Screen | Captured | Notes |
|---|---|---|
| `C-02`/`C-03` plan setup | ☐ | |
| `C-01` caregiver dashboard (due) | ☐ | |
| `E-01`/`E-03` elder due + Mark as taken | ☐ | |
| `C-01` caregiver Taken + stock | ☐ | |
| `S-01` notification read | ☐ | |
| `F-*` family read view | ☐ | |
| `C-09` / `C-12` / `E-08` | ☐ | Day list grows with the range |
| Help request + availability | ☐ | |
| Idempotency RPC responses + counts | ☐ | Laptop |

## Sign-off

| Item | Done |
|---|---|
| Dry-run passed end to end | ☐ |
| Evidence complete | ☐ |
| Known limitations recorded (proactive missed-dose `pg_cron`; no remote push; card gradient fallback) | ☐ |
