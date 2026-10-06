# Checking runbook — 2026-10-15/16

The instructor's 3rd-Increment checking demonstrates **one complete medication-adherence
transaction cycle** on the installed preview APK, against the **hosted** Supabase project, with
every message in-app. This is the operational script. The demo of record is
`docs/specs/sprint-4.md` §"Checking runbook"; this file adds the pre-flight, the evidence to
capture, and the fallbacks.

Environment: Android phone (main target), hosted project `buwwkdhzansbyeytsufj.supabase.co`, 17
migrations applied. Synthetic demo accounts only — credentials live in the git-ignored
`apps/mobile/.env.demo-accounts` and are never printed, committed, or sent to any AI tool.

---

## 0. Pre-flight (do this the day before)

| # | Check | Command / how | Expected |
|---|---|---|---|
| 1 | Hosted schema in sync | `npx supabase migration list --linked` | All 17 local ↔ remote |
| 2 | Keep-alive green | GitHub → Actions → "Supabase keep-alive" → Run workflow | Green run |
| 3 | APK installed | **Rebuild required** — the installed `e2c86c9f` (commit `cc8ff92`) predates Sprints 5/7/8/9 and the `expo-calendar`/`expo-notifications` native modules. The config now declares the `expo-calendar` plugin (so `READ_CALENDAR`/`WRITE_CALENDAR` reach the manifest) and no longer requests the cut prescription-photo permission; `app.json` `versionCode` is **3**. `eas build -p android --profile preview`, install, and record the build id here: `____________` | App launches, connects |
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
5. **Family — read-only.** The family Home shows the care summary with a **7 / 30 / 90-day**
   range selector; **Meds** the plan and the adherence row, **Visits** the appointments, **More →
   Care circle** the active links. Access is read-only for all medical data — the only writes a
   family member has are accepting/completing a help request and setting their own availability.

## 1c. Optional — reports and history browsing (Sprint 9)

A read-only pass that shows the reported surfaces without touching the medication cycle:

1. **Caregiver — adherence report (`C-09`).** From the caregiver dashboard, open **Reports** and
   switch the range **7 / 30 / 90 days**; the counts and the per-medicine breakdown change with it.
2. **Caregiver — care activity timeline (`C-12`).** Open **Activity**: the merged audit + stock
   timeline lists the runs above (dose confirmed, stock adjusted, appointment changes) newest first.
3. **Elder — personal adherence (`E-08`).** The elder's own adherence screen shows the same
   range selector scoped to the elder.
4. **Family — summary range (`F-10`).** The family Home care summary honours the same **7 / 30 / 90**
   range, shown as **counts only** (no per-medicine payload) — the RPC itself limits the payload.

All four are **read-only**; they add no tables and no native dependency.

## 1b. Optional — help-request cycle (Sprint 8)

A second, lighter cycle that shows the family role is not only read-only:

1. **Elder — ask.** `E-01` → **Ask for help**, choose a category (e.g. Practical) and an optional
   note, then send. (Every active member is notified; the elder is not notified of their own ask.)
2. **Circle notified.** The caregiver and each active family member get an in-app notification; while
   the app is running, a **device notification** also appears (local presentation — there is no
   remote push service).
3. **First member accepts.** Family **Help** tab → open the request → **Offer to help**. The state
   becomes **Accepted** and the accepter is recorded; a second member can no longer claim it.
4. **Complete.** The elder or the accepter taps **Mark as done** → **Completed**.
5. **Availability.** Family **More → My availability** sets Available / Not available plus a short
   note; it shows per member on the care circle (`F-14`).

Captured rows: one `help_requests` row moving `open → accepted → completed` with timestamps (never
hard-deleted); `notifications` rows for each event; one `member_availability` row per member.

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
- **Help-request evidence** (if section 1b is run): one `help_requests` row per run with its state
  transitions timestamped, the matching `notifications` rows, and the `member_availability` toggle.
- **Reports evidence** (if section 1c is run): screenshots of `C-09`, `C-12`, `E-08` and the family
  summary at each range, and confirmation that a direct read of the family summary returns
  **counts only**.
- **Test-case table** for the thesis: step → expected → observed (with the screenshot reference).

---

## 4. Fallbacks and known limits

- **Proactive missed-dose notification** depends on `pg_cron`; if the scheduled transition is not
  observed, state it as a limitation rather than claiming it.
- **Device notifications have no remote push service.** A help-request device notification is a
  **local** presentation fired by the app when it receives the row over Realtime, so it needs the app
  running and connected; the in-app notification centre is the source of truth.
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
