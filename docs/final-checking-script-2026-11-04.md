# Final checking script — ElderCare+ — 4–6 November 2026

**Evaluator:** Ms. Liezel F. Grande, MIT — Program Chair, BS Information Systems.
**Assigned window:** 4, 5 or 6 November 2026 (no switching evaluators, no remarks after this).
**What is being checked:** full working cycle, all modules, UI/UX, the security items under Mr. Roel
Daniot, and a live demonstration of frontend + backend + database + user roles. The brief also says
**"use real-time samples as data"** — demonstrate with live data, never screenshots.

This script is the 12-minute run. The long-form operational detail stays in
`docs/presentation-runbook-2026-10-23.md`; the evidence sheet stays in
`docs/presentation-evidence-2026-10-23.md`.

---

## 0. Before the room (T–30 minutes)

| # | Check | Pass looks like |
|---|---|---|
| 1 | APK installed on all three phones | `versionCode` **6** build from `main` (record the EAS build id in §9) |
| 2 | Hosted project awake | Open the app once; `auth/v1/health` answers 200 |
| 3 | Three accounts already signed in | Caregiver, elder, family — re-registering on stage burns demo time |
| 4 | Password rule (new, Sprint 11) | Any **new** account needs **10+ chars with an upper-case letter, lower-case letter and a number**. Older 8-character accounts still sign in |
| 5 | Fingerprint enrolled on the caregiver phone | Profile → Security says "asks for your fingerprint or your password" |
| 6 | Dark mode on one phone | Proves the both-themes requirement |
| 7 | Laptop open | Supabase Studio SQL editor + a terminal with `$SUPABASE_URL` / `$ANON` exported |
| 8 | Backup screenshots captured | Only used if a phone misbehaves — never as the primary demo |

**Do not wait for a live clock tick.** Statuses are derived at screen load; pull to refresh after the
scheduled minute passes.

---

## 1. Opening — 30 seconds

> "ElderCare+ coordinates medication between three people: the older adult who takes the medicine, the
> family caregiver who sets it up, and a connected family member who can only read. It is a React
> Native app on Supabase Postgres — every read is row-level-security scoped, every medical write goes
> through a guarded database function, and the app can never hard-delete medical history."

Then show the three home screens, one sentence each:

| Role | Screen | One line |
|---|---|---|
| Caregiver | Dashboard | "What is due, what was taken, what is running low." |
| Elder | Home | "One big card, one 56 dp button: Mark as taken." |
| Family | Home | "Read-only summary with a 7 / 30 / 90 day range." |

---

## 2. The medication transaction cycle — 4 minutes (the core)

| # | Device | Tap | Audience sees |
|---|---|---|---|
| 1 | Caregiver | **Meds → Add medication** | `C-03`: medicine, strength, dose, schedule, batch |
| 2 | Caregiver | Save + activate | Plan active, dose generated |
| 3 | Both | Re-open home | The same dose on both phones |
| 4 | Elder | **Mark as taken** — exactly once | Button disappears, "Confirmed", "Taken at HH:MM" |
| 5 | **Caregiver** | **Do not touch the phone** | The dashboard flips to **Taken** on its own — that is Realtime |
| 6 | Caregiver | Bell → Notifications → tap the row | Unread → read, opens the dose record |
| 7 | Family | Home | The dose appears in the read-only summary |

**Say it at step 4–5:** one elder tap produced **one `dose_events` row, one stock decrement, one
`inventory_transactions` row, one `audit_events` row and one `notifications` row** — in one guarded
transaction. A second tap cannot duplicate any of it (§4.6).

---

## 3. Real-time proof — 30 seconds

Two live events, no refresh:

1. **Dose → caregiver:** elder confirms; the caregiver dashboard updates (publication on `dose_events`
   and `notifications`).
2. **Help request → circle:** elder **Ask for help**; the caregiver's bell badge changes without a
   refresh (publication on `help_requests`).

> "Realtime is a *mirror*, not the source of truth: RLS decides which rows a subscriber may receive,
> and every screen also refetches on focus. If Realtime drops, nothing is lost."

If a device shows the old bundle: taps closing the app mean the APK predates the 2026-10-26 channel-topic
fix — install the current build (§0).

---

## 4. Security — 5 minutes

This is the segment Mr. Daniot's subject is checking. Do it in this order; each item is 30–60 seconds.

### 4.1 Authentication and the password policy (45 s)

1. Welcome → **Create account** → type a weak password (`abc12345`) → **Create account**.
2. The field says **"Use at least 10 characters."** — the form never reaches the server.
3. Say: *"The server enforces the same rule — Supabase Auth rejects it with `weak_password`. The client
   copy exists so the elder is not sent on a round-trip; the server is the authority."*

Optional laptop proof (10 s):

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"policy@example.com","password":"abc12345"}'
# → 422 weak_password, reasons: length, characters
```

### 4.2 App lock and biometrics (60 s)

1. **Profile → Security** card: app lock is on, 2-minute background timeout, fingerprint available.
2. Tap **Lock now** → the system fingerprint prompt appears.
3. Cancel it → the app's own lock screen: **no medical data, no email** — only the account name.
4. Tap **Unlock with password**, type the password → back in.
5. Then demonstrate the timer: **Home button**, wait two minutes, reopen → locked again.

> "The lock is not a client flag: the password path re-authenticates against Supabase Auth, and five
> wrong passwords pause the keypad for 30 seconds. The fingerprint never leaves the phone — Android
> Keystore verifies it, the app only receives a yes/no."

### 4.3 Roles and row-level security (45 s)

- Family phone: no edit, add or remove control anywhere; the write RPCs are not even offered.
- Laptop, as **anon** (no token):

```bash
curl -s "$SUPABASE_URL/rest/v1/medications?select=id" -H "apikey: $ANON"
# → 401 / 42501: no policy for anon
```

> "RLS is on with default deny for every table; the elder can write exactly one thing — their own due
> dose — and only through `confirm_dose`."

### 4.4 Guarded functions + re-authentication (45 s)

- Caregiver → **Care links and invites** → withdraw family consent. The dialog asks for the password.
- Enter it → the link is revoked and audited.
- Say: *"The server checks the token's `amr` timestamp — a password sign-in within 300 seconds. A client
  boolean is never enough; a token older than that is rejected with `insufficient_privilege`."*

### 4.5 Private prescription storage (30 s)

- Caregiver → Meds → a medicine → prescription photo → tap the thumbnail.
- Say: *"The bucket is private. The image loads through a short-lived signed URL generated for this
  circle; there is no public URL, and anon cannot read the object."*
- Elder/family see the same photo **read-only**. Removing it **archives** the row and the object — it
  never hard-deletes, and an `medication_image.archived` audit row is written.

### 4.6 Idempotency — the headline claim (90 s, laptop)

Call the same RPC twice as the elder:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/confirm_dose" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ELDER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"p_dose_event_id\":\"<dose-id>\"}"
```

| Call | Response |
|---|---|
| First | `{"status":"taken","duplicate":false,"stock":"decremented","taken_at":"…"}` |
| Second | `{"status":"taken","duplicate":true,"stock":"unchanged","taken_at":"<same>"}` |

```sql
select count(*) from inventory_transactions where source_dose_event_id = '<dose-id>';         -- 1
select count(*) from audit_events where target_id = '<dose-id>' and action = 'dose.confirmed'; -- 1
select count(*) from notifications where related_id = '<dose-id>';                           -- 1
```

Name the guards: a unique dose-occurrence key, the one-time `update … where taken_at is null`, and a
unique stock-decrement key. This is the requirement that survives an offline retry.

### 4.7 Audit trail (20 s)

Caregiver → **Reports → Activity**: `dose.confirmed`, the stock adjustment and the photo archive, newest
first. *"Medical history is append-only; nothing is hard-deleted."*

---

## 5. The rest of the system — 2 minutes

| Module | Tap | One line |
|---|---|---|
| Reports | **Reports** 7 / 30 / 90 | Per-day counts + totals; no per-medicine breakdown (state the limit honestly) |
| Elder adherence | Elder → Home → My adherence | Same range, scoped to the elder |
| Appointments | Caregiver → Calendar → New appointment | Elder and family see it read-only |
| Emergency | Elder → Emergency | Always one tap; caregiver owns the contacts |
| Help circle | Family → Help → Offer to help → Mark as done | One member claims; availability shows on the circle |
| Prescription photo | Caregiver → Meds → medicine | Covered in §4.5 |

---

## 6. Likely questions (one-line answers)

| Question | Answer |
|---|---|
| Why three roles? | `adr-001`: the approved scope needs a read-only family member; it is modelled as care-circle membership, not a second account type. |
| Where does the password live? | Supabase Auth (GoTrue) hashes it server-side; the app sends it once and stores only the session, in the device keystore. |
| Why no email verification? | Synthetic demo accounts and no mail service on the free tier; the server still enforces password policy, rate limits and RLS. State it as a demo-environment choice. |
| What happens offline? | Dose confirmations queue in a local outbox and retry; the RPC is idempotent, so a retry cannot duplicate a dose or a stock decrement. |
| Is there AI? | No. Prescription photos are storage only — no OCR, nothing auto-fills a medicine. That keeps the "never suggest or change a dose" rule structural. |
| Missed doses? | The transition RPC exists and is scheduled with `pg_cron`; if the sweep is not observed live, say it is a documented limitation rather than claiming it ran. |
| Notifications? | In-app notification centre is the source of truth; Realtime mirrors it; there is no remote push service (free tier). |
| What if the demo APK is old? | Taps closing the app = pre-fix bundle. Install the current build; the crash was the fixed Realtime channel topic. |

---

## 7. If something breaks

| Symptom | Do this |
|---|---|
| A tap closes the app | Old APK. Install the current build; interim: force-stop and reopen (fresh JS session). |
| Realtime row does not move | Pull to refresh — it is the documented fallback; do not claim Realtime worked if it did not. |
| Fingerprint prompt does not appear | Use **Unlock with password**; say the password path is the fallback by design. |
| Hosted project paused (first request times out) | Open the app once, wait ~30 s, retry. |
| A query returns rows it should not | Stop, do not improvise; the RLS claim is the one to protect. |

---

## 8. Evidence to capture during the run

1. Screenshot: caregiver dashboard after the elder's confirmation (Taken + timestamp).
2. Screenshot: notifications row opened from the bell.
3. Screenshot: lock screen (no medical data visible) and the Security card.
4. Terminal: the second `confirm_dose` response (`duplicate: true`) and the three counts = 1.
5. SQL: the three rows written by one dose confirmation.
6. Note the APK build id and `versionCode` in §9.

---

## 9. Build of record

| Field | Value |
|---|---|
| EAS build id | `4baaa0d1-8208-4485-ac68-7bf9d4b5724e` (finished 2026-11-02 19:08) |
| Commit | `5e6f27e` (app code `6fe7b78`) |
| `versionCode` | **6** (verified with `aapt dump badging`) |
| Fingerprint | `47bf46ed19e02f7aba7a65535c9ab304ccde69c3` |
| APK | `https://expo.dev/artifacts/eas/gAmYxK3ckCT8HTNSXByFKMNqLKC_CL4G80j80P0a2Oc.apk` |
| Installed on | caregiver phone, elder phone, family phone |

**Installed and smoke-tested on the Android emulator (2026-11-02):** the standalone APK launches,
signs in, shows the "Allow notifications" prompt once (tap **Allow**), locks on demand, unlocks with
the fingerprint and with the password. This APK replaces `939eec2d` and is the build of record.

> One post-build commit (`55fa146`, on branch `after-checking/sign-out-lock-record`) clears the lock
> timestamp after a real sign-out. It is **not** in this APK and is not needed for the checking: the
> three phones stay signed in for the whole demo.

---

## 10. What was verified on the emulator (2026-11-02)

Run on the Android emulator (`Medium_Phone_API_37.0`, Android 17, fingerprint enrolled) against the
hosted project, with the API 37 system image and a synthetic test account. This is the evidence behind
the §4.1/§4.2 claims; repeat §4.2 on the physical phone during the dry run.

| Check | Result |
|---|---|
| Sign-up form rejects a weak password | Inline **"Use at least 10 characters."**, no request sent |
| Hosted Auth rejects the same weak password | `422 weak_password` (reasons: `length`, `characters`) |
| Existing 8-character demo account still signs in | Yes — the policy only applies at signup/password change |
| Sign-up with a compliant password | Account created, routed to the caregiver shell |
| Security card | "App lock: On. After 2 minutes in the background this app asks for your fingerprint or your password." |
| Lock now → system prompt | "Unlock ElderCare+" with "Touch the fingerprint sensor" |
| Fingerprint unlock | Simulated touch (`adb emu finger touch 1`) → back on Profile |
| Password unlock | Wrong password → "That password is not correct."; correct password → unlocked |
| 2-minute background lock | Home for 2 min 22 s → reopening shows the lock screen and the fingerprint prompt |
| Cold-start lock | Killing and reopening the app after 2 minutes → locked again |
| Lock screen contents | Account name only: no email, no medicines, no appointments |
| 5-attempt cooldown | Policy transition unit-tested (`registerUnlockFailure`, 199 JS tests); the banner is driven by the same value |
