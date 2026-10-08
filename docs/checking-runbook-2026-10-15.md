# Checking runbook — 2026-10-15/16

The instructor's 3rd-Increment checking demonstrates **one complete medication-adherence
transaction cycle** on the installed preview APK, against the **hosted** Supabase project, with
every message in-app. This is the operational script. The demo of record is
`docs/specs/sprint-4.md` §"Checking runbook"; this file adds the pre-flight, the evidence to
capture, and the fallbacks.

Environment: Android phone (main target), hosted project `buwwkdhzansbyeytsufj.supabase.co`, 18
migrations applied. Synthetic demo accounts only — credentials live in the git-ignored
`apps/mobile/.env.demo-accounts` and are never printed, committed, or sent to any AI tool.

**Device plan:** three roles, one session per install. Use **three devices** — caregiver and elder
on two phones, family on a tablet/emulator (or the assistant's device). Do not plan on holding all
three live on two phones.

---

## 0. Pre-flight (do this the day before)

| # | Check | Command / how | Expected |
|---|---|---|---|
| 1 | Hosted schema in sync | `npx supabase migration list --linked` | All 18 local ↔ remote |
| 2 | Keep-alive green | GitHub → Actions → "Supabase keep-alive" → Run workflow | Green run |
| 3 | APK installed | **Rebuild required** — the installed `e2c86c9f` (commit `cc8ff92`) predates Sprints 5/7/8/9 and the `expo-calendar`/`expo-notifications` native modules. `eas build -p android --profile preview`, install, and record the build id here: `____________` | App launches, connects |
| 4 | Accounts signed in | Caregiver + elder on two phones; family on a third device | Each sees only their own data |
| 5 | Care circle linked | `node scripts/provision-demo-circle.mjs` (idempotent; links caregiver↔elder, creates the elder profile, and consents the family link) | "Care circle pre-provisioned" |
| 6 | Connectivity | Wi-Fi/mobile data on | Requests succeed |
| 7 | Pre-demo backup | `npx supabase db dump -f backup.sql --linked` | File written (git-ignored) |
| 8 | Fresh cycle state | The hosted `dose_events` may already contain history. **Never delete it.** Provide a fresh cycle by deactivating the previous medicine and creating a new plan for the demo; the pre-flight assertion is "no dose for the new schedule yet", not "table empty". | New plan has no confirmation yet |
| 9 | Missed-dose job | `select jobname, schedule from cron.job where jobname = 'transition-missed-doses';` | Row present → §2 can be claimed; absent → §2 is a limitation |

---

## 1. The demo of record (happy path)

Run with the three devices signed in and connectivity on. **Do not wait for a live clock tick:** the
elder screens derive status at load time, so after the scheduled minute passes, **pull to refresh /
leave and re-enter** the screen before tapping.

1. **Caregiver — set up the plan.** `C-02` → **Add medication** (`C-03`). Fill it so the cycle can
   actually settle a dose and decrement stock:
   - schedule at **demo-local now + 5 minutes**, **today's weekday selected**;
   - **grace 120 minutes** (the form defaults to 30 — change it);
   - a batch with **`hasBatch` on**, a **matching unit**, an **expiry in the future** and
     **quantity ≥ the dose**;
   - start date **today**.
   Save and activate.
2. **Generation.** Both apps open; `ensure_dose_events` runs for the schedule's "today". The
   caregiver confirms the dose appears for the elder (`C-01` / `E-01`). If it does not, re-open
   the screens (generation is triggered on load, not by a timer).
3. **Elder — confirm once.** At the scheduled time, **pull to refresh** `E-01`/`E-03` until it shows
   **Due now**, then tap **Mark as taken** exactly once.
4. **Caregiver — sees it.** **Pull to refresh** `C-01` (do not rely on Realtime being enabled on the
   project). It shows **Taken**, the timestamp, **stock decreased by exactly the dose**, and an
   unread notification. `S-01` marks it read and opens the related record.
5. **Family — read-only.** The family Home shows the care summary with a **7 / 30 / 90-day** range
   selector; **Meds** the plan and dose rows, **Visits** the appointments, **More → Care circle**
   the active links. Access is read-only for all medical data — the only writes a family member has
   are accepting/completing a help request and setting their own availability.

---

## 1b. Reports and history browsing (Sprint 9)

A read-only pass that shows the reported surfaces without touching the medication cycle:

1. **Caregiver — adherence report (`C-09`).** From the caregiver dashboard, open **Reports** and
   switch the range **7 / 30 / 90 days**. The report is a **per-day count list plus totals** — there
   is no per-medicine breakdown. With a single confirmed dose, the **totals stay the same** across
   ranges; what visibly changes is the **length of the day-by-day list** (7 vs 30 vs 90 rows).
   (There is no per-medicine payload; do not claim one.)
2. **Caregiver — care activity timeline (`C-12`).** Open **Activity**: the merged audit + stock
   timeline lists the runs above (dose confirmed, stock adjusted, appointment changes) newest first.
3. **Elder — personal adherence (`E-08`).** The elder's own adherence screen shows the same range
   selector scoped to the elder.
4. **Family — summary range (`F-10`).** The family Home care summary honours the same **7 / 30 / 90**
   range. The **report RPC payload** is counts + dates only (no per-medicine data). Note that the
   family Home and Meds screens separately show dose rows (medicine name, time, status) from the
   existing Sprint 4 read access — so "counts only" describes the report payload, not the whole
   family UI.

All four are **read-only**; they add no tables and no native dependency.

---

## 1c. Help-request cycle (Sprint 8)

A second, lighter cycle that shows the family role is not only read-only:

1. **Elder — ask.** `E-01` → **Ask for help**, choose a category (e.g. Practical) and an optional
   note, then send. (Every active member is notified; the elder is not notified of their own ask.)
2. **Circle notified.** The caregiver and each active family member get an **in-app notification**.
   While the app is running **on a device with notification permission granted**, a **device
   notification** also appears (local presentation — there is no remote push service). Keep the
   caregiver/family app in the foreground; the in-app notification centre is the source of truth.
3. **First member accepts.** Family **Help** tab → open the request → **Offer to help**. The state
   becomes **Accepted** and the accepter is recorded; a second member can no longer claim it.
4. **Complete.** The elder or the accepter taps **Mark as done** → **Completed**.
5. **Availability.** Family **More → My availability** sets Available / Not available plus a short
   note; it shows per member on the care circle (`F-14`).

Captured rows: one `help_requests` row moving `open → accepted → completed` with timestamps (never
hard-deleted); `notifications` rows for each event (help transitions do **not** write
`audit_events`); one `member_availability` row per member.

---

## 2. Missed-dose negative proof (evidence-gated)

A second dose left unconfirmed past its grace should show **Missed** with one notification.

- The in-app **Missed** state is derived from the device clock and is **not** proof that the
  scheduled transition ran.
- **Claim the scheduled transition only if** pre-flight row 9 showed the `transition-missed-doses`
  job **and** you actually observe `missed_at` / the notification after the sweep. Otherwise state
  it as a documented limitation.

---

## 3. Evidence to capture

- **Screenshots** at each step: the plan, the due dose, the confirmation, the caregiver's Taken +
  stock outcome, the notification, the family read view, the reports ranges.
- **Database after the run** — scope every query to the demo IDs, never table-wide counts (setup and
  prior runs leave other rows). For the demo schedule/dose:
  - `select id, taken_at, status from dose_events where schedule_id = '<demo-schedule>' order by scheduled_at;`
  - `select delta, reason, source_dose_event_id from inventory_transactions where source_dose_event_id = '<demo-dose>';`
  - `select action, target_id from audit_events where target_id = '<demo-dose>' and action = 'dose.confirmed';`
  - `select event_type, read_at from notifications where related_id = '<demo-dose>';`
- **Idempotency proof** (the headline claim) — the APK cannot show it, because the action button
  disappears after success. On the laptop, as the **elder's JWT**, call the RPC twice against the
  same dose:
  1. first call: response has `duplicate: false`; capture the new `taken_at`, one inventory row, one
     `dose.confirmed` audit row, one notification;
  2. second call with the same dose id: response has `duplicate: true` and **no** new `taken_at`,
     stock, inventory, audit or notification row.
  Screenshot the JSON responses and the before/after counts. Name the three DB guards behind it:
  the unique dose occurrence key, the one-time conditional confirmation, and the unique
  dose-decrement inventory key.
- **Help-request evidence** (§1c): the `help_requests` row and its timestamped transitions, the
  matching `notifications` rows, and the `member_availability` toggle.
- **Reports evidence** (§1b): screenshots of `C-09`, `C-12`, `E-08` and the family summary at each
  range, and confirmation that a direct read of the family report RPC returns **counts + dates
  only**.
- **Test-case table** for the thesis: step → expected → observed (with the screenshot reference).

---

## 4. Fallbacks and known limits

- **Proactive missed-dose notification** depends on `pg_cron`; if the scheduled transition is not
  observed, state it as a limitation rather than claiming it.
- **Device notifications have no remote push service.** A help-request device notification is a
  **local** presentation fired by the app when it receives the row over Realtime, so it needs the
  app running, a notification permission granted, and the notification published for Realtime
  (the checking fix `20261109120000_realtime_notifications.sql` adds `notifications` to the
  publication). Expo Go cannot load `expo-notifications` on Android at all (SDK 53+), so device
  notifications only appear in the preview APK / a development build; in Expo Go the feature is a
  silent no-op and everything else works normally.
- **Realtime** refreshes `C-01` on a confirmation; if the subscription is unavailable the dashboard
  still refreshes on focus, so the demo does not depend on it.
- **Card gradient** renders with React Native's native `experimental_backgroundImage`; a device that
  ignores it degrades to the flat fallback colour. The contingency is `expo-linear-gradient` (a new
  dependency that needs owner approval).
- **No React Native component runner** exists, so on-screen behaviour rides this device pass, not a
  test suite.

---

## 5. Re-running or resetting

Medical history is never hard-deleted. To re-run the cycle, **deactivate** the medicine (or its
schedule) and create a new plan; the previous plan, dose events and audit rows remain. The pre-demo
`backup.sql` is the recovery point if a reset is ever needed.
