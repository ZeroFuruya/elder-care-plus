# Presentation runbook — ElderCare+ — 2026-10-23

The demo of record for the presentation: **one complete medication-adherence transaction cycle** on
the installed **preview APK**, against the **hosted** Supabase project, with every message **in-app**.
Plus the supporting passes (reports, help request, appointments, family read-only) and the
idempotency proof.

- **Runtime:** Android phone (main target), hosted project `buwwkdhzansbyeytsufj.supabase.co`, **18**
  migrations applied.
- **Roles:** caregiver, elder, connected family member — three devices, one session per install.
- **Data:** synthetic fixtures only. Demo credentials live in the git-ignored
  `apps/mobile/.env.demo-accounts` and are **never** printed, committed, or shown on screen.
- Companion docs: `docs/checking-runbook-2026-10-15.md` (operational detail),
  `docs/presentation-evidence-2026-10-23.md` (evidence sheet).

---

## 0. Build of record

| Field | Value |
|---|---|
| EAS build id | `b5134e38-abff-4250-92fd-a7cc507ebdc3` (FINISHED 2026-10-22) |
| Git commit | `61eafd7` (`main`; versionCode bump only on top of `149a89e`) |
| `versionCode` | **4** |
| `expo.version` | `0.0.1` |
| Package | `com.zerofuruya.eldercareplus` |
| Profile | `preview` (internal distribution, installable APK) |
| APK artifact | `https://expo.dev/artifacts/eas/DovhIqJpjeqtS1dnrP4p4FAfKI4OgX5eWCJ4B6urciY.apk` (~108 MB) — **expires 2026-11-05** |
| Fingerprint | `379a25cc042241c6d2f061479867d52873b24c94` |
| Hosted project | `buwwkdhzansbyeytsufj.supabase.co` (18 migrations, local ↔ remote in sync) |

> **Install:** open the artifact link on the phone (Allow install from this source), or over USB
> `adb install -r <downloaded>.apk`. Same signing key as earlier builds, so it installs over the
> previous versionCode 3 install.

> Rebuild command (only if needed): `cd apps/mobile && eas build -p android --profile preview`.
> Each build consumes 1 of the 15 monthly free Android builds — do not rebuild casually.

---

## 1. Pre-flight

### T-1 day

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Hosted schema in sync | `npx supabase migration list --linked` | All 18 local ↔ remote |
| 2 | Keep-alive green | GitHub → Actions → "Supabase keep-alive" → Run workflow | Green run (project awake) |
| 3 | APK installed | Install build `TBD` on the phone(s) | App launches, connects |
| 4 | Accounts work | Sign in on all three devices | Each sees only its own data |
| 5 | Circle linked | `node scripts/provision-demo-circle.mjs` | "Care circle pre-provisioned" |
| 6 | Backup taken | **Start Docker Desktop**, then `npx supabase db dump -f backup.sql --linked` | Non-zero file written (git-ignored) |
| 7 | Missed-dose job | Supabase Studio: `select jobname from cron.job where jobname='transition-missed-doses';` | Row present → §5 can be claimed |

### T-30 minutes (on site)

- [ ] Phone(s) charged; **Do Not Disturb** off but notifications allowed for ElderCare+.
- [ ] Wi-Fi / mobile data on; open the app once to confirm it reaches hosted.
- [ ] Sign in **each** role on its device (caregiver + elder on two phones, family on the third).
- [ ] Prepare a **fresh cycle**: deactivate any earlier demo medicine and be ready to create a new
      plan — the assertion is "no dose for the *new* schedule yet", never "table is empty".
- [ ] Screen mirroring / projector tested; bump screen brightness.
- [ ] Backup screenshot set on hand (see §7) in case the live device misbehaves.

---

## 2. The demo of record — the medication transaction cycle

> **Do not wait for a live clock tick.** Statuses are derived at screen load, so after the scheduled
> minute passes, **pull to refresh** (or leave and re-enter the screen) before tapping.

| # | Device | Steps | What the audience should see |
|---|---|---|---|
| 1 | **Caregiver** | **Meds** → **Add medication** | `C-03` form opens |
| 2 | **Caregiver** | Fill: medicine + strength, dose quantity+unit, schedule **today's weekday**, time **now + 5 min**, **grace 120**, a batch (**has-batch on**, matching unit, **future expiry**, quantity ≥ dose), start **today**. Save and **activate**. | Plan saved and active |
| 3 | **Caregiver + Elder** | Open/re-open the home screens | `ensure_dose_events` generates today's occurrence; the dose appears on both |
| 4 | **Elder** | **Home** → dose card until **Due now** → **Mark as taken** (**exactly once**) | 56 dp button; screen becomes **Confirmed** with "Taken at HH:MM" |
| 5 | **Caregiver** | **Dashboard** → pull to refresh | **Taken** + timestamp, **stock decreased by exactly the dose**, **unread** count |
| 6 | **Caregiver** | Bell → **Notifications** (`S-01`) → tap the row | Unread → read; opens the related dose record |
| 7 | **Family** | **Home** | Read-only **care summary** with **7 / 30 / 90** range + the recent dose row |

**Say out loud, at step 4–5:** one elder tap produced, in a single guarded transaction, **one
`dose_events` row, one `inventory_transactions` decrement, one `audit_events` row and one
`notifications` row** — and a second tap cannot duplicate any of it.

---

## 3. Supporting passes (show if time allows)

### 3a. Reports and history

| Device | Steps | Point to make |
|---|---|---|
| Caregiver | **Reports** → range **7 / 30 / 90** | `C-09`: a **per-day count list + totals** — the *day list grows* with the range; there is **no per-medicine breakdown** |
| Caregiver | **Reports → Activity** | `C-12`: merged audit + stock timeline, newest first |
| Elder | **Home → My adherence** | `E-08`: same range selector, scoped to the elder |
| Family | **Home** care summary | `F-10`: range honoured; the report payload is **counts + dates only** |

### 3b. Help request (Sprint 8)

1. **Elder** → **Ask for help** → pick a category + optional note → send.
2. **Caregiver / Family** get an **in-app notification**. (A device notification also appears *only*
   while the app is foregrounded with permission — there is **no remote push service**.)
3. **Family → Help** → open → **Offer to help** → state becomes **Accepted** (a second member can no
   longer claim it).
4. **Mark as done** → **Completed**.
5. **Family → More → My availability** → Available / Not available + note → shows on the care circle
   (`F-14`).

### 3c. Appointments and elder profile

- **Caregiver → Calendar → New appointment**; the **elder** and **family** then see it read-only.
- **Elder → Emergency** is always one tap away; the **caregiver** owns the elder's profile and
  emergency contacts (`Profile` → elder profile).

---

## 4. Idempotency proof (the headline claim)

The confirm button disappears after success, so this is proven **on the laptop**, not the APK: call
`confirm_dose` **twice** as the **elder's JWT** against the same dose.

| # | Step | Expected |
|---|---|---|
| 1 | First call | `duplicate: false`; `taken_at` set once |
| 2 | Second call (same dose) | `duplicate: true` |
| 3 | Re-check the DB | **No** new `taken_at`, stock, inventory, audit or notification row |
| 4 | Name the guards | unique dose-occurrence key; one-time conditional confirmation; unique dose-decrement inventory key |

---

## 5. Missed-dose negative proof (evidence-gated)

A dose left past its grace shows **Missed** — but that in-app state is derived from the **device
clock** and is **not** proof the scheduled sweep ran.

- Claim the `pg_cron` transition **only if** pre-flight row 7 showed the `transition-missed-doses`
  job **and** you actually observe `missed_at` / the notification after the sweep.
- Otherwise state it plainly as a **documented limitation**.

---

## 6. Fallbacks (if something breaks on stage)

| Symptom | Do this |
|---|---|
| Dose not showing as Due | **Pull to refresh** / leave and re-enter the screen (status is derived on load) |
| Caregiver dashboard not updating | Pull to refresh — the demo does **not** depend on Realtime |
| No device notification | Expected without remote push; use the **in-app** notification centre. Expo Go can't load `expo-notifications` at all — device notifications only work in this **preview APK** |
| Network drops | The dose list still renders; an elder confirmation queues as **Pending sync** and flushes later (never duplicated) |
| Card gradient missing | Falls back to the flat colour — cosmetic only |
| App won't connect | Check Wi-Fi; the hosted project is Free and pauses only after ~a week idle (keep-alive covers it) |
| Total failure | Switch to the **backup screenshot set** and narrate §2 |

---

## 7. Backup screenshot set (capture during the T-1 dry-run)

`C-02`/`C-03` plan setup · `C-01` caregiver dashboard (due) · `E-01`/`E-03` elder due + Mark as taken ·
`C-01` Taken + stock · `S-01` notification read · `F-*` family read view · `C-09` / `C-12` / `E-08`
range views · help request + availability · idempotency RPC responses + counts.

---

## 8. Talking points / likely questions

- **No medical advice, ever.** The app never suggests a substitute medicine, changes a dose, or tells
  the elder to stop treatment; unclear/expired/conflicting info routes to the caregiver or a clinician.
  There is **no AI/OCR in this build** (that sprint was dropped) — so nothing is AI-generated here.
- **Idempotency is a DB-level requirement**, not a UI nicety: one `dose_events` row per schedule
  occurrence, so an offline retry can never duplicate a `taken_at` or double-decrement stock.
- **Security:** RLS is default-deny on every table; the elder writes **only** their own due dose and
  **only** through a guarded RPC; the service-role key is server-only. Consent, unlink, account
  deletion and evidence-access changes require **re-authentication** (verified `amr`, not a client flag).
- **History is never hard-deleted** — deactivate/archive with timestamps; confirmed doses, stock
  adjustments and past appointment states all produce an `audit_events` row.
- **Privacy:** notifications stay in-app; lock-screen text is minimal; full medical detail only after
  authenticated in-app navigation.
- **Three roles:** the "connected family member" is a real third role with a **read-only** boundary —
  their only writes are accepting/completing a help request and setting their own availability.
- **Accessibility:** 48 dp targets (56 dp for *Mark as taken*), status is never conveyed by colour
  alone, and both light and dark themes pass the contrast check.

---

## 9. After the demo

- Fill the evidence tables in `docs/presentation-evidence-2026-10-23.md` (scope every DB query to the
  demo IDs — never a table-wide count).
- Leave the demo data in place: **never hard-delete** history. The pre-demo `backup.sql` is the
  recovery point if a reset is ever needed.
