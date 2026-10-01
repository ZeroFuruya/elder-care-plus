# Checking evidence — 2026-10-15/16

Fill-in evidence sheet for the instructor's 3rd-Increment checking. It records the **one complete
medication-adherence transaction cycle** demonstrated on the installed preview APK against the
hosted project (see `docs/checking-runbook-2026-10-15.md` for the operational script).

> **Never fabricate results.** Leave a cell blank or mark it `not observed` until it is actually
> seen. Screenshots are the proof; this table only indexes them. Synthetic demo data only — no real
> personal or health data. Never paste screenshots of the account credentials or the `.env` files.

## Run metadata

| Field | Value |
|---|---|
| Date / time | |
| Environment | Android phone, hosted `buwwkdhzansbyeytsufj.supabase.co` |
| App build | preview APK `e2c86c9f` (commit `cc8ff92`) |
| Migrations | 11 local ↔ remote in sync |
| Care circle | Pre-provisioned (`scripts/provision-demo-circle.mjs`): caregiver↔elder active, family↔elder active |
| Accounts | Caregiver / elder / family — synthetic (`apps/mobile/.env.demo-accounts`) |
| Pre-run backup | `backup.sql` taken (git-ignored) — yes / no |

## Test cases

Step → expected → observed. Reference the screenshot id from the index below.

| ID | Step | Expected | Observed | Pass | Screenshot |
|---|---|---|---|---|---|
| TC-01 | Caregiver `C-02` → **Add medication** (`C-03`): medicine, schedule at now+5 min, grace 120, batch (matching unit, future expiry, qty ≥ dose) | Plan saves and activates; the medicine appears in `C-02` | | | |
| TC-02 | Both apps open; `ensure_dose_events` runs for today | The due occurrence exists; caregiver sees it on `C-01`, elder on `E-01` | | | |
| TC-03 | At the scheduled time, elder `E-01`/`E-03` | Shows **Due now** with the 56 dp **Mark as taken** action | | | |
| TC-04 | Elder taps **Mark as taken** exactly once | Confirmation accepted; screen shows **Taken** and the time | | | |
| TC-05 | Caregiver `C-01` after the confirmation | Shows **Taken** and the timestamp for that dose | | | |
| TC-06 | Caregiver stock view | Stock decreased by **exactly** the dose; the stock outcome line is shown | | | |
| TC-07 | Caregiver notices | One **unread** in-app notification; `S-01` marks it read and opens the related record | | | |
| TC-08 | Family view | Shows the plan and the adherence row, with **no management control** (read-only) | | | |
| TC-09 | Idempotency: confirm the **same** dose a second time | Returns `duplicate: true`; **no** new `taken_at`, stock, inventory, audit or notification row | | | |
| TC-10 | Optional negative: a second dose left unconfirmed past its grace | Shows **Missed** with one notification — *claim only if the `pg_cron` transition is actually observed* | | | |

## Database verification (after the run)

Read-only queries. Expected row counts for **one** confirmed dose.

| Table | Expected | Observed |
|---|---|---|
| `dose_events` | 1 row; `taken_at` set exactly once; `missed_at` null | |
| `inventory_transactions` | 1 row; `delta` = −dose_quantity; linked to the dose event | |
| `audit_events` | 1 row for the confirmation (plus pre-existing provisioning rows) | |
| `notifications` | 1 row for the recipient; unread → read after `S-01` | |
| `medications` / `schedules` / `batches` | 1 each for the new plan | |

Idempotency proof (headline claim): before/after counts around TC-09 —

| Count | Before second confirm | After second confirm | Unchanged? |
|---|---|---|---|
| `taken_at` set | | | |
| `inventory_transactions` | | | |
| `audit_events` | | | |
| `notifications` | | | |

## Screenshot index

| ID | Screen | Device | What it shows | File |
|---|---|---|---|---|
| S-01 | `C-02` plan list | Caregiver | New medicine + schedule + stock | |
| S-02 | `E-01` today | Elder | Due dose at the scheduled time | |
| S-03 | `E-03` dose detail | Elder | **Mark as taken** (56 dp) | |
| S-04 | `E-01`/`E-03` after tap | Elder | **Taken** + time | |
| S-05 | `C-01` dashboard | Caregiver | **Taken**, timestamp, stock outcome | |
| S-06 | `S-01` notifications | Caregiver | Unread dose notification | |
| S-07 | Family view | Family | Read-only plan + adherence | |
| S-08 | Idempotency response | — | `duplicate: true` on the second confirm | |

## Known limits to state honestly (do not claim otherwise)

- **Proactive missed-dose notification** depends on the hosted `pg_cron` job; if the scheduled
  transition is not observed, state it as a limitation (screen-derived *Missed* still works, and
  `confirm_dose` settles a lapsed dose).
- **Realtime** refreshes `C-01` on a confirmation; the dashboard also refreshes on focus, so the demo
  does not depend on the subscription.
- **Card gradient** uses React Native's native `experimental_backgroundImage`; a device that ignores
  it degrades to the flat fallback colour.
- **No React Native component runner** exists, so on-screen behaviour rides this device pass, not a
  unit-test suite.

## Sign-off

| Role | Name | Date |
|---|---|---|
| Demonstrated by | | |
| Observed / checked by | | |
