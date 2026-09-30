# Checking runbook — 2026-10-15/16

The instructor's 3rd-Increment checking demonstrates **one complete medication-adherence
transaction cycle** on the installed preview APK, against the **hosted** Supabase project, with
every message in-app. This is the operational script. The demo of record is
`docs/specs/sprint-4.md` §"Checking runbook"; this file adds the pre-flight, the evidence to
capture, and the fallbacks.

Environment: Android phone (main target), hosted project `buwwkdhzansbyeytsufj.supabase.co`, 11
migrations applied. Synthetic demo accounts only — credentials live in the git-ignored
`apps/mobile/.env.demo-accounts` and are never printed, committed, or sent to any AI tool.

---

## 0. Pre-flight (do this the day before)

| # | Check | Command / how | Expected |
|---|---|---|---|
| 1 | Hosted schema in sync | `npx supabase migration list --linked` | All 11 local ↔ remote |
| 2 | Keep-alive green | GitHub → Actions → "Supabase keep-alive" → Run workflow | Green run |
| 3 | APK installed | Install from build `e2c86c9f` (commit `cc8ff92`) | App launches, connects |
| 4 | Accounts signed in | Caregiver + elder on the phone; family for the read view | Each sees only their own data |
| 5 | Connectivity | Wi-Fi/mobile data on | Requests succeed |
| 6 | Pre-demo backup | `npx supabase db dump -f backup.sql --linked` | File written (git-ignored) |
| 7 | Fresh state | `dose_events` empty on hosted | The run creates the first cycle |

---

## 1. The demo of record (happy path)

Run with both apps signed in and connectivity on.

1. **Caregiver — set up the plan.** `C-02` → **Add medication** (`C-03`): a medicine, a schedule at
   **demo-local now + 5 minutes** with **grace 120 minutes**, and a batch with a **matching unit**,
   an **expiry in the future** and **quantity ≥ the dose**. Save and activate.
2. **Generation.** Both apps open; `ensure_dose_events` runs for the schedule's "today". The
   caregiver confirms the dose appears for the elder (`C-01` / `E-01`).
3. **Elder — confirm once.** At the scheduled time `E-01`/`E-03` shows **Due now**; the elder taps
   **Mark as taken** exactly once.
4. **Caregiver — sees it.** `C-01` shows **Taken**, the timestamp, **stock decreased by exactly the
   dose**, and an unread notification. `S-01` marks it read and opens the related record.
5. **Family — read-only.** The family view shows the plan and the adherence row, with **no
   management control**.

## 2. Optional negative proof (missed dose)

A second dose left unconfirmed past its grace should show **Missed** with one notification.
**Claim this only after the scheduled `pg_cron` transition is actually seen to run** — `pg_cron
1.6.4` / `pg_net 0.20.4` are available on hosted but the proactive notification is a documented
limitation until observed.

---

## 3. Evidence to capture

- **Screenshots** at each step, both devices: the plan, the due dose, the confirmation, the
  caregiver's Taken + stock outcome, the notification, the family read view.
- **Database after the run** (read-only queries): one `dose_events` row with `taken_at` set once;
  one `inventory_transactions` row; one `audit_events` row; one unread → read `notifications` row.
- **Idempotency proof** (the headline claim): confirming the same dose a second time returns
  `duplicate: true` and writes **no** new `taken_at`, stock, inventory, audit or notification row.
- **Test-case table** for the thesis: step → expected → observed (with the screenshot reference).

---

## 4. Fallbacks and known limits

- **Proactive missed-dose notification** depends on `pg_cron`; if the scheduled transition is not
  observed, state it as a limitation rather than claiming it.
- **Realtime** refreshes `C-01` on a confirmation; if the subscription is unavailable the dashboard
  still refreshes on focus, so the demo does not depend on it.
- **Card gradient** renders with React Native's native `experimental_backgroundImage`; a device that
  ignores it degrades to the flat fallback colour. The contingency is `expo-linear-gradient` (a new
  dependency that needs owner approval).
- **No React Native component runner** exists, so on-screen behaviour rides this device pass, not a
  test suite.

## 5. Re-running or resetting

Medical history is never hard-deleted. To re-run the cycle, **deactivate** the medicine (or its
schedule) and create a new plan; the previous plan, dose events and audit rows remain. The pre-demo
`backup.sql` is the recovery point if a reset is ever needed.
