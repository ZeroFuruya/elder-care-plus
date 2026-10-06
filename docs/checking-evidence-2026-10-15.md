# Checking evidence — 2026-10-15/16

Filled in during the dry-run and again at the checking. This sheet is the evidence of record for the
thesis: one complete medication-adherence transaction cycle on the installed preview APK against the
**hosted** Supabase project, plus the optional help-request and reports passes.

Operational script: `docs/checking-runbook-2026-10-15.md`. Do not print, commit, or send the demo
account credentials anywhere — they live in the git-ignored `apps/mobile/.env.demo-accounts`.

> Status: **skeleton — not yet filled.** Replace every `TBD` during the dry-run.

## Build under test

| Field | Value |
|---|---|
| EAS build id | `TBD` |
| Git commit | `TBD` (expected `e858eda`, the config fix) |
| `versionCode` | 3 |
| Package | `com.zerofuruya.eldercareplus` |
| Hosted project | `buwwkdhzansbyeytsufj.supabase.co` (17 migrations) |
| Device / Android version | `TBD` |
| Date/time of dry-run | `TBD` |

## Pre-flight

| # | Check | Expected | Observed | Pass |
|---|---|---|---|---|
| 1 | `npx supabase migration list --linked` | All 17 in sync | TBD | ☐ |
| 2 | Keep-alive workflow run | Green | TBD | ☐ |
| 3 | APK installed and launches | Launches, connects to hosted | TBD | ☐ |
| 4 | Accounts signed in (caregiver, elder, family) | Each sees only own data | TBD | ☐ |
| 5 | Connectivity | Requests succeed | TBD | ☐ |
| 6 | Pre-demo `db dump` | File written (git-ignored) | TBD | ☐ |
| 7 | `dose_events` empty on hosted | Fresh state | TBD | ☐ |

## Test cases — demo of record (medication cycle)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver adds medicine + schedule (now + 5 min, grace 120) + batch, activates | Plan saved and active | TBD | `TBD` |
| 2 | `ensure_dose_events` generates the dose | Dose visible on caregiver and elder | TBD | `TBD` |
| 3 | Elder taps **Mark as taken** once | Dose shows Taken | TBD | `TBD` |
| 4 | Caregiver dashboard | Taken + timestamp + stock decreased by exactly the dose + unread notification | TBD | `TBD` |
| 5 | Caregiver marks notification read (`S-01`) | Unread → read, opens the related record | TBD | `TBD` |
| 6 | Family Home (read-only) | Care summary (7/30/90 range), plan + adherence row, appointments, care circle | TBD | `TBD` |

## Test cases — idempotency (headline claim)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Confirm the same dose a second time | Returns `duplicate: true` | TBD | `TBD` |
| 2 | Re-check the database after the retry | **No** new `taken_at`, stock, inventory, audit or notification row | TBD | `TBD` |

## Database after the run (read-only queries)

| Table | Expected | Observed |
|---|---|---|
| `dose_events` | One row, `taken_at` set once | TBD |
| `inventory_transactions` | One row, stock decremented by the dose | TBD |
| `audit_events` | One row for the confirmation | TBD |
| `notifications` | One row, unread → read | TBD |

## Optional — help-request cycle (Sprint 8)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Elder asks for help (category + note) | Request created; elder not notified of own ask | TBD | `TBD` |
| 2 | Circle notified | Caregiver + every active family member get in-app + device notification | TBD | `TBD` |
| 3 | First member offers to help | `open → accepted`, accepter recorded; a second member cannot claim it | TBD | `TBD` |
| 4 | Mark as done | `accepted → completed` | TBD | `TBD` |
| 5 | Member availability | Available / Not available + note shows on care circle (`F-14`) | TBD | `TBD` |

## Optional — reports and history (Sprint 9)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver `C-09` report, 7/30/90 | Counts + per-medicine breakdown change with the range | TBD | `TBD` |
| 2 | Caregiver `C-12` timeline | Merged audit + stock events, newest first | TBD | `TBD` |
| 3 | Elder `E-08` | Same range, scoped to the elder | TBD | `TBD` |
| 4 | Family `F-10` summary | Range honoured, **counts only** in the payload | TBD | `TBD` |

## Optional — negative proof (missed dose)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Leave a dose past its grace | Shows Missed with one notification | TBD | `TBD` |
| 2 | `pg_cron` transition | Only claim if the scheduled transition is **actually observed** | TBD | `TBD` |

## Screenshot set

| Screen | Captured | Notes |
|---|---|---|
| `C-02`/`C-03` plan setup | ☐ | |
| `C-01` caregiver dashboard (due) | ☐ | |
| `E-01`/`E-03` elder due + Mark as taken | ☐ | |
| `C-01` caregiver Taken + stock | ☐ | |
| `S-01` notification read | ☐ | |
| `F-*` family read view | ☐ | |
| `C-09` / `C-12` / `E-08` (optional) | ☐ | |
| Help request + availability (optional) | ☐ | |

## Sign-off

| Item | Done |
|---|---|
| Dry-run passed end to end | ☐ |
| Evidence complete | ☐ |
| Known limitations recorded (proactive missed-dose `pg_cron`; no remote push; card gradient fallback) | ☐ |
