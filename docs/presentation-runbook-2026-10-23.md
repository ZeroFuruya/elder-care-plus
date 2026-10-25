# Presentation runbook — ElderCare+ — 2026-10-23

The demo of record for the presentation: **one complete medication-adherence transaction cycle** on
the installed **preview APK**, against the **hosted** Supabase project, with every message **in-app**.
Plus the supporting passes (reports, help request, appointments, family read-only) and the
idempotency proof.

- **Runtime:** Android phone (main target), hosted project `buwwkdhzansbyeytsufj.supabase.co`, **18**
  migrations applied.
- **Roles:** caregiver, elder, connected family member — **three devices**, one session per install.
- **Accounts:** **three brand-new accounts are registered in-app for this demo** (dummy emails, easy
  passwords). The pre-provisioned demo accounts and `scripts/provision-demo-circle.mjs` are **not
  used**. The presenter chooses and owns the credentials; **never commit, print or screen-share the
  passwords**, and only ever enter **synthetic** data.
- Companion docs: `docs/presentation-evidence-2026-10-23.md` (evidence sheet),
  `docs/checking-runbook-2026-10-15.md` (extra operational detail).

---

## 0. Build of record

| Field | Value |
|---|---|
| EAS build id | `939eec2d-c005-462d-8608-8048b3d9e72e` (2026-10-25; replaces `b5134e38`) |
| Git commit | `db63867` (`main`) |
| `versionCode` | **5** |
| `expo.version` | `0.0.1` |
| Package | `com.zerofuruya.eldercareplus` |
| Profile | `preview` (internal distribution, installable APK) |
| Build page | `https://expo.dev/accounts/zerofuruyas-team/projects/eldercare-plus/builds/939eec2d-c005-462d-8608-8048b3d9e72e` |
| APK artifact | from the build page once it shows **FINISHED** (Download → APK) |
| Fingerprint | from the build page |
| Hosted project | `buwwkdhzansbyeytsufj.supabase.co` (19 migrations, local ↔ remote in sync) |

> **Install:** open the artifact link on the phone (**Allow install from this source**), or over USB
> `adb install -r <downloaded>.apk`. Same signing key as earlier builds, so it installs cleanly over a
> previous install.

> **Do not rebuild.** This APK was built from the same app code as `main` today, and the build is
> valid until 2026-11-05. Each build consumes 1 of the 15 monthly free Android builds.
>
> **Exception (2026-10-25):** the Sprint 10 prescription-photo feature adds the native
> `expo-image-picker`, so it is **not** in `b5134e38`. Do §4d only after a **rebuilt preview APK**;
> the rebuild supersedes this one and is the new build of record below.

---

## 1. Set up the demo accounts (do this first, ~10 min)

Register all three accounts and link the circle **before** you rehearse or present. The accounts
persist on the hosted project, so you register once and reuse them for the dry-run **and** the demo.

### 1.1 Register three fresh accounts

On each device: **Welcome → Create account**, pick the role, and complete the form.

| Device | Role card to pick | Email | Password |
|---|---|---|---|
| Phone A | **Family caregiver** | dummy, e.g. `demo.care@gmail.com` | easy, **≥ 8 characters** |
| Phone B | **Older adult** | dummy, e.g. `demo.elder@gmail.com` | easy, **≥ 8 characters** |
| Phone C | **Connected family member** | dummy, e.g. `demo.family@gmail.com` | easy, **≥ 8 characters** |

Form rules the screen enforces:

- **Name:** at least 2 characters.
- **Email:** must look like `name@example.com` (a real, resolvable domain is not required).
- **Password:** **at least 8 characters** (this is stricter than the server's 6-character minimum).
- **Confirm password** must match.
- A **role is mandatory** — the account cannot be created without choosing one.

Hosted Auth has **confirm-email off**, so signup **signs you in immediately** — no email link to click.

### 1.2 Link the caregiver and the elder

1. **Phone A (caregiver)** — on the Dashboard tap **Link an older adult** → **Create a link code**.
   A six-digit code appears **once**; it is **single-use** and **expires in 24 hours**.
2. **Phone B (elder)** — Home → **Enter a caregiver's code** → type the six digits → **Link accounts**.
   The elder's redemption **is** their consent, so the link goes **straight to active**.
3. **Verify:** the elder's Home shows *"Linked caregiver: …"*, and the caregiver's Dashboard stops
   showing *"No older adult linked yet"*.

> If a code expires or is mistyped, create a **new** one from the caregiver's **Care links and
> invites** screen. Too many wrong codes triggers a short cooldown.

### 1.3 Create the elder's profile (required before the dashboard will show)

The caregiver Dashboard shows **"No emergency information yet."** until this exists — this is the
screen that has to render for the medication cycle.

1. **Phone A (caregiver)** — Dashboard → **Create elder profile** (`A-09`).
2. Fill the profile with **synthetic** data only (any name, DOB, blood type, a demo address).
3. **Save and continue** → lands on the elder profile read view (`C-10`).

### 1.4 Invite and approve the family member

1. **Phone A (caregiver)** — **Care links and invites** → **Invite a family member** → type **Phone
   C's exact email address** → **Create an invite code**.
   The invite is **bound to that email** — a different account cannot redeem it.
2. **Phone C (family)** — Home → **Enter an invite code** → type the six digits.
   The screen shows *"Your request was sent. The older adult must approve it…"* — still **pending**.
3. **Phone B (elder)** — Home → **Review a family member's access** → **Approve access** → enter the
   **elder's password** (this is a re-authenticated, sensitive action).
4. **Verify:** **Phone C** now shows the read-only **Family view** with a **Care summary**.

### 1.5 Circle checklist

- [ ] Caregiver ↔ elder link **active**
- [ ] Elder profile row **exists** (Dashboard no longer prompts)
- [ ] Family link **active** (not "waiting for approval")
- [ ] Each device shows **only its own** data

---

## 2. Pre-flight

### T-1 day

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Hosted schema in sync | `npx supabase migration list --linked` | All 19 local ↔ remote |
| 2 | Keep-alive green | GitHub → Actions → **Supabase keep-alive** → Run workflow | Green run (project awake) |
| 3 | APK installed | Install `939eec2d` on all three devices | App launches, connects |
| 4 | Accounts work | Sign in all three roles | Each sees only its own data |
| 5 | Circle linked | §1 above | Checklist in §1.5 all ticked |
| 6 | Backup taken | **Start Docker Desktop**, then `npx supabase db dump -f backup.sql --linked` | Non-zero file written (git-ignored) |
| 7 | Missed-dose job | Supabase Studio SQL: `select jobname from cron.job where jobname='transition-missed-doses';` | Row present → §6 can be claimed |

### T-30 minutes (on site)

- [ ] Phones charged; **Do Not Disturb off**; notifications **allowed** for ElderCare+.
- [ ] Wi-Fi / mobile data on; open the app once to confirm it reaches hosted.
- [ ] Sign in **each** role on its device (caregiver + elder on two phones, family on the third).
- [ ] Confirm the circle still looks right (§1.5) — the accounts persist, nothing needs re-linking.
- [ ] Prepare a **fresh cycle**: the accounts are new, so there is **no prior medicine** — just be
      ready to create the plan at step 1 of §3. (If you rehearsed on the same accounts, **deactivate**
      the earlier demo medicine and add a new one; the assertion is "no dose for the *new* schedule
      yet", never "the table is empty".)
- [ ] Screen mirroring / projector tested; bump screen brightness.
- [ ] Backup screenshot set on hand (§8) in case a device misbehaves.

---

## 3. The demo of record — the medication transaction cycle

> **Do not wait for a live clock tick.** Statuses are derived at screen load, so after the scheduled
> minute passes, **pull to refresh** (or leave and re-enter the screen) before tapping.

| # | Device | Steps | What the audience should see |
|---|---|---|---|
| 1 | **Caregiver** | **Meds** → **Add medication** | `C-03` form opens |
| 2 | **Caregiver** | Fill: medicine + strength, dose quantity + unit, schedule **today's weekday**, time **now + 5 min**, **grace 120**, a batch (**has-batch on**, matching unit, **future expiry**, quantity ≥ dose), start **today**. Save and **activate**. | Plan saved and active |
| 3 | **Caregiver + Elder** | Open / re-open the home screens | `ensure_dose_events` generates today's occurrence; the dose appears on both |
| 4 | **Elder** | **Home** → dose card until **Due now** → **Mark as taken** (**exactly once**) | 56 dp button; screen becomes **Confirmed** with "Taken at HH:MM" |
| 5 | **Caregiver** | **Dashboard** → pull to refresh | **Taken** + timestamp, **stock decreased by exactly the dose**, **unread** count |
| 6 | **Caregiver** | Bell → **Notifications** (`S-01`) → tap the row | Unread → read; opens the related dose record |
| 7 | **Family** | **Home** | Read-only **care summary** with **7 / 30 / 90** range + the recent dose row |

**Say out loud, at steps 4–5:** one elder tap produced, in a single guarded transaction, **one
`dose_events` row, one `inventory_transactions` decrement, one `audit_events` row and one
`notifications` row** — and a second tap cannot duplicate any of it.

---

## 4. Supporting passes (show if time allows)

### 4a. Reports and history

| Device | Steps | Point to make |
|---|---|---|
| Caregiver | **Reports** → range **7 / 30 / 90** | `C-09`: a **per-day count list + totals** — the *day list grows* with the range; there is **no per-medicine breakdown** |
| Caregiver | **Reports → Activity** | `C-12`: merged audit + stock timeline, newest first |
| Elder | **Home → My adherence** | `E-08`: same range selector, scoped to the elder |
| Family | **Home** care summary | `F-10`: range honoured; the report payload is **counts + dates only** |

### 4b. Help request (Sprint 8)

1. **Elder** → **Ask for help** → pick a category + optional note → send.
2. **Caregiver / Family** get an **in-app notification**. (A device notification also appears *only*
   while the app is foregrounded with permission — there is **no remote push service**.)
3. **Family → Help** → open → **Offer to help** → state becomes **Accepted** (a second member can no
   longer claim it).
4. **Mark as done** → **Completed**.
5. **Family → More → My availability** → Available / Not available + note → shows on the care circle
   (`F-14`).

### 4c. Appointments and elder profile

- **Caregiver → Calendar → New appointment**; the **elder** and **family** then see it read-only.
- **Elder → Emergency** is always one tap away; the **caregiver** owns the elder's profile and
  emergency contacts (`Profile` → elder profile).

### 4d. Prescription photo (Sprint 10 — needs the rebuilt APK)

> **Native change.** `expo-image-picker` is native, so this pass needs the rebuilt preview APK
> `939eec2d` (it replaces `b5134e38`; a rebuild uses 1 of the 15 monthly Android builds). Hosted has
> the Sprint 10 migration applied, so the backend is ready — only the client build is new.

| Device | Steps | Point to make |
|---|---|---|
| Caregiver | **Meds** → a medicine → **Prescription photos** → **Add prescription photo** → **Take photo** / **Choose from library** | The choice is an **in-app** dialog (no system alert); the photo is attached to that medicine |
| Caregiver | Tap the thumbnail | The full photo loads from a **short-lived signed URL** — the bucket is private, there is no public URL |
| Elder / Family | Open the same medicine | The **same photo, read-only**; there is no add or remove control |
| Caregiver | **Remove** → confirm | It is **archived, not deleted**; a `medication_image.archived` audit row is written |

- **Guardrail:** nothing reads the photo. There is **no OCR and no AI** - the image never creates or
  fills a medicine, dose or schedule; it is only ever shown to a human.

**Fallback if on-device capture misbehaves on stage.** A laptop can seed a synthetic photo onto the
caregiver's circle through the *same* public path the app uses (Storage upload + `register_medication_image`;
no service-role key):

```bash
node scripts/seed-demo-prescription-photo.mjs --email <caregiver-email> --password <password> --medication-id <uuid>
# omit --medication-id to attach to the circle's newest medicine; --list only lists medicines
```

It generates a clearly synthetic "prescription" PNG by default (`--file` to use a real image). Note the
pre-provisioned `apps/mobile/.env.demo-accounts` passwords are **stale**, so pass the presenter's own
fresh credentials explicitly.

---

## 5. Idempotency proof (the headline claim) — laptop, ~5 min

The APK's confirm button disappears after success, so the app **cannot** show a second call. Prove the
guard at the API instead: call `confirm_dose` **twice** as the **elder's JWT** against the same dose.

**Step 1 — capture the confirmed dose id.** Supabase Studio SQL editor:

```sql
select id, scheduled_at, taken_at, status
from dose_events
where elder_id = '<elder-uuid>'
order by scheduled_at desc
limit 5;
```

**Step 2 — get the elder's token** (use your own new demo credentials; never commit them):

```bash
export SUPABASE_URL=https://buwwkdhzansbyeytsufj.supabase.co
export ANON=<the publishable anon key>
export ELDER_EMAIL=<elder demo email>
export ELDER_PASSWORD=<elder demo password>

TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ELDER_EMAIL\",\"password\":\"$ELDER_PASSWORD\"}" | jq -r .access_token)
```

**Step 3 — call the RPC twice** against the same dose id:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/confirm_dose" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"p_dose_event_id\":\"<dose-id>\"}"
```

| # | Call | Expected response |
|---|---|---|
| 1 | First, on a **still-due** dose | `{"status":"taken","duplicate":false,"stock":"decremented","taken_at":"…"}` |
| 2 | Immediately again, same dose | `{"status":"taken","duplicate":true,"stock":"unchanged","taken_at":"<same>"}` |

**Step 4 — prove nothing else was written** (counts stay at 1):

```sql
select count(*) from inventory_transactions where source_dose_event_id = '<dose-id>';        -- 1
select count(*) from audit_events  where target_id = '<dose-id>' and action = 'dose.confirmed'; -- 1
select count(*) from notifications where related_id = '<dose-id>';                            -- 1
```

**Step 5 — name the guards:** a **unique dose-occurrence key**; the **one-time conditional
`update … where taken_at is null`**; and a **unique dose-decrement inventory key**.

---

## 6. Missed-dose negative proof (evidence-gated)

A dose left past its grace shows **Missed** — but that in-app state is derived from the **device
clock** and is **not** proof the scheduled sweep ran.

- Claim the `pg_cron` transition **only if** pre-flight row 7 showed the `transition-missed-doses`
  job **and** you actually observe `missed_at` / the notification after the sweep.
- Otherwise state it plainly as a **documented limitation**.

---

## 7. Fallbacks (if something breaks on stage)

| Symptom | Do this |
|---|---|
| Dose not showing as Due | **Pull to refresh** / leave and re-enter the screen (status is derived on load) |
| Caregiver dashboard not updating | Pull to refresh — the demo does **not** depend on Realtime |
| No device notification | Expected without remote push; use the **in-app** notification centre. Expo Go can't load `expo-notifications` at all — device notifications only work in this **preview APK** |
| Network drops | The dose list still renders; an elder confirmation queues as **Pending sync** and flushes later (never duplicated) |
| Card gradient missing | Falls back to the flat colour — cosmetic only |
| App won't connect | Check Wi-Fi; the hosted project is Free and pauses only after ~a week idle (keep-alive covers it) |
| Family can't redeem the invite | The invite is bound to the email typed by the caregiver — it must match the family account's email exactly. Create a new invite if needed |
| Link code expired | Codes are single-use and last 24 h — create a new one from **Care links and invites** |
| Total failure | Switch to the **backup screenshot set** (§8) and narrate §3 |

---

## 8. Backup screenshot set (capture during the dry-run)

`C-02`/`C-03` plan setup · `C-01` caregiver dashboard (due) · `E-01`/`E-03` elder due + Mark as taken ·
`C-01` Taken + stock · `S-01` notification read · `F-*` family read view · `C-09` / `C-12` / `E-08`
range views · help request + availability · **`C-04` prescription photo (add + view) and its
read-only family view (§4d)** · idempotency RPC responses + counts.

---

## 9. Talking points / likely questions

- **No medical advice, ever.** The app never suggests a substitute medicine, changes a dose, or tells
  the elder to stop treatment; unclear/expired/conflicting info routes to the caregiver or a clinician.
  There is **no AI/OCR in this build** — the only photo feature **stores** a caregiver's prescription
  photo privately for the care circle to view (§4d); **nothing reads or interprets it**, and nothing
  here is AI-generated.
- **Idempotency is a DB-level requirement**, not a UI nicety: one `dose_events` row per schedule
  occurrence, so an offline retry can never duplicate a `taken_at` or double-decrement stock.
- **Security:** RLS is default-deny on every table; the elder writes **only** their own due dose and
  **only** through a guarded RPC; the service-role key is server-only. Consent, unlink, account
  deletion and evidence-access changes require **re-authentication** (a verified recent-password
  state, not a client flag) — you demonstrate this live when the elder approves the family member.
- **History is never hard-deleted** — deactivate/archive with timestamps; confirmed doses, stock
  adjustments and past appointment states all produce an `audit_events` row.
- **Privacy:** notifications stay in-app; lock-screen text is minimal; full medical detail only after
  authenticated in-app navigation.
- **Three roles:** the "connected family member" is a real third role with a **read-only** boundary —
  their only writes are accepting/completing a help request and setting their own availability.
- **Accessibility:** 48 dp targets (56 dp for *Mark as taken*), status is never conveyed by colour
  alone, and both light and dark themes pass the contrast check.

---

## 10. After the demo

- Fill the evidence tables in `docs/presentation-evidence-2026-10-23.md` (scope every DB query to the
  demo IDs — never a table-wide count).
- Leave the demo data in place: **never hard-delete** history. The pre-demo `backup.sql` is the
  recovery point if a reset is ever needed.
- Do **not** commit or screenshot the demo passwords.
