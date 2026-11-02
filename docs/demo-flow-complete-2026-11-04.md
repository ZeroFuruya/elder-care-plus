# ElderCare+ — Complete demo flow, walkthrough and function map

**Final checking · 4–6 November 2026 · Evaluator: Ms. Liezel F. Grande, MIT**

This is the long-form document: **every screen, every action, and the exact path one piece of data
takes through the three users.** The 12-minute stage run is `docs/final-checking-script-2026-11-04.md`;
this file is what you practise from and what you open when she asks "and where is that used?".

Read it in this order:

| Part | What it is | When you use it |
|---|---|---|
| **Part 1** | The cast, the connection graph, the one-cycle cheat sheet | Learn it once; glance at it before you start |
| **Part 2** | The walkthrough in five acts, with exact labels to tap | Rehearse and perform |
| **Part 3** | Appendices: every screen, every function, the permission matrix | Answer questions; prove coverage |

---

# Part 1 — The shape of the demo

## 1.1 The cast

| Phone | Role | Display in the app | What this account is allowed to do |
|---|---|---|---|
| **A** | `caregiver` | "Family caregiver" | **Writes** the plan: medicines, schedules, stock, appointments, elder profile, emergency contacts, prescription photos, invites. **Cannot** confirm a dose. |
| **B** | `elder` | "Older adult" | **Reads** their day; **writes exactly one medical thing**: confirm their own due dose. Approves or removes family access. Asks for help. |
| **C** | `family_member` | "Connected family member" | **Read-only** everywhere. Two deliberate exceptions: accept/complete a help request, and set their own availability. |

That asymmetry *is* the product. Say it early:

> "Three roles, three apps in one binary. The caregiver owns the plan, the older adult owns the
> confirmation, and the family member can look but not touch. The app decides which shell you get by
> reading your `profiles.role` row — not from anything the phone remembers."

## 1.2 The connection graph

```
        PHONE A · CAREGIVER
        ┌───────────────────────────────────────┐
        │ Meds · Calendar · Reports · Profile   │
        │ Dashboard (read-only for doses)       │
        └───────────────┬───────────────────────┘
                        │
        care_links (member_role = 'caregiver', status = 'active')
        6-digit code created by A, redeemed by B — takes effect immediately
                        │
                        ▼
        PHONE B · ELDER
        ┌───────────────────────────────────────┐
        │ Today · Meds · Calendar · Emergency   │
        │ one write: confirm_dose               │
        └───────────────┬───────────────────────┘
                        │
        care_links (member_role = 'family_member')
        code created by A → redeemed by C → status 'invited'
        → ONLY THE ELDER can approve → status 'active'
                        │
                        ▼
        PHONE C · FAMILY MEMBER
        ┌───────────────────────────────────────┐
        │ Family view · Medicines · Visits      │
        │ Help · More  (all read-only)          │
        └───────────────────────────────────────┘
```

**The one sentence that explains the consent boundary:**

> "The caregiver can *invite* a family member, but only the older adult can *grant* the access. A
> caregiver cannot hand out someone else's medical record."

## 1.3 One row, three views

This is the clearest way to show "clear connections between the three users". Pick the dose event
created in Act 2 and show the same row three times:

| Who looks at the same `dose_events` row | What they see | Can they change it? |
|---|---|---|
| Caregiver (Dashboard, dose detail) | "Taken at 14:32 · Stock −1 tablet" | No — dose events are read-only for the caregiver by design |
| Elder (Today → dose) | "Confirmed. Taken at 14:32." | Only before it is taken (the `Mark as taken` button) |
| Family (Home activity list) | The status card, no action buttons | No |

Same table, same row, three different renders because the **query is scoped by RLS**, not because the
app hides buttons.

## 1.4 The single cycle — cheat sheet

If you only remember one page, remember this.

```
    A: Meds → Add medication ──► medications + medication_schedules + medicine_batches
                                        │
                                        │  ensure_dose_events()  (runs on screen load)
                                        ▼
                                 dose_events (status due)
                                        │
    B: Today → dose → Mark as taken ────┤  confirm_dose()
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │ ONE guarded transaction writes FIVE things:               │
        │ 1. dose_events.taken_at        (status → taken)           │
        │ 2. medicine_batches.quantity   (−1 tablet)                │
        │ 3. inventory_transactions      (+1 row, ledger)           │
        │ 4. audit_events                (+1 row, dose.confirmed)   │
        │ 5. notifications               (+1 row, for A)            │
        └───────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
    A: dashboard flips   C: Family view shows   A: bell badge
       to "Taken"           the confirmation        increments
       (Realtime)           on refresh              (notification)
```

Everything else in the app is a variation on that shape: **a caregiver writes, the database guards
it, every actor reads a scoped slice, and history is never deleted.**

---

# Part 2 — The walkthrough

## Act 0 · Before the room (T–30)

| # | Check | Pass looks like |
|---|---|---|
| 1 | APK on all three phones | `versionCode` **6**, EAS `4baaa0d1-8208-4485-ac68-7bf9d4b5724e` |
| 2 | Notification permission granted | The OS prompt was answered **Allow** once per phone |
| 3 | Fingerprint enrolled on Phone A | Profile → Security card says "asks for your fingerprint or your password" |
| 4 | Dark mode on one phone | Proves both-theme support |
| 5 | All three accounts already signed in | Do not register on stage; Act 0.1 is a *fallback* |
| 6 | Laptop ready | Supabase SQL editor + a terminal with `$SUPABASE_URL` / `$ANON` exported |
| 7 | Fresh state | Phone A linked to Phone B, Phone C active, **no medicine yet** for the cycle |

**Do not wait for a clock tick.** Dose status is derived at screen load, so pull to refresh (or leave
and re-enter the screen) after the scheduled minute passes.

---

## Act 1 · Connect the three users (5 minutes)

> **Purpose:** show that roles and access are *database facts*, not app settings — and that the
> elder, not the caregiver, grants family access.

### 1.1 Three accounts, three shells

| # | Phone | Tap | What she should see |
|---|---|---|---|
| 1 | A | Welcome → **Create an account** → role card **Family caregiver** | Lands on **Dashboard**: "No older adult linked yet" |
| 2 | B | Welcome → **Create an account** → role card **Older adult** | Lands on **Today**: "No caregiver is linked to this account yet." |
| 3 | C | Welcome → **Create an account** → role card **Connected family member** | Lands on **Family view**: "No record is shared with you" |

Password, if you register live: **10+ characters with an upper-case letter, a lower-case letter and a
number** (§4.1 shows why).

**Say:** *"Each phone opened a different shell. The routing reads `profiles.role` from the server. There
is no client-side switch, and a caregiver token cannot open the elder tabs — the layout redirects it."*

### 1.2 Caregiver creates a code · elder redeems it — the caregiver↔elder link

| # | Phone | Tap | Result |
|---|---|---|---|
| 1 | A | Dashboard → **Link an older adult** (or **Care links and invites** → **Create a link code**) | "Share this code now" + a six-digit code |
| 2 | A | **I have written it down** | Code is hidden again |
| 3 | B | Today → **Enter a caregiver's code** | Screen "Link a caregiver" |
| 4 | B | Type the six digits → **Link accounts** | "Your caregiver is linked…" → **Go to my care circle** |
| 5 | B | Back to **Today** | "Linked caregiver: *<name>*" |

**What happened in the database:** one `care_links` row, `member_role = 'caregiver'`,
`status = 'active'`. The code itself is stored hashed, and an invalid attempt cannot burn someone
else's code.

### 1.3 Caregiver fills in the care profile — the elder never writes their own

Phone A now shows "No emergency information yet." That is the caregiver's setup step, not a bug.

| # | Phone | Tap | Fields |
|---|---|---|---|
| 1 | A | **Create elder profile** | **Identity:** birth date, blood type · **Medical summary:** conditions, allergies, care instructions · **Doctor and emergency:** primary doctor, phone · **Address:** five lines |
| 2 | A | **Save and continue** | Dashboard becomes the real dashboard |

**Say:** *"Look at what the elder's Profile screen has: name, email, role, and a Security card. No edit
control. The older adult cannot rewrite the diagnosis or the allergies — the caregiver enters them,
and every change is audited."*

### 1.4 Caregiver invites family · **elder approves** — the consent boundary

| # | Phone | Tap | Result |
|---|---|---|---|
| 1 | A | **Care links and invites** → *Invite a family member* → their email → **Create an invite code** | Six-digit code in *Your invites* |
| 2 | C | **Family view** → **Enter an invite code** → code → **Link accounts** | "Your request was sent. The older adult must approve it…" |
| 3 | B | **Today** → **Review a family member's access** | Care circle opens |
| 4 | B | **Approve access** → confirm dialog | Link becomes active |
| 5 | C | Pull to refresh | **Family view** with "You can see *<name>*", Care summary, activity |

**Say:** *"Step 2 created the link as `invited`. Not visible, not readable. Only step 4 flipped it to
`active`, and only the elder's account could do that. If the family phone tried to read the record
while invited, RLS would return zero rows."*

### Act 1 ends with this state

| | Phone A (caregiver) | Phone B (elder) | Phone C (family) |
|---|---|---|---|
| Link to elder | `active`, manager | — | `active`, read-only |
| Can write medicines | yes | no | no |
| Can confirm doses | no | yes | no |
| Can see the record | yes | own | read-only |

---

## Act 2 · The cycle (7 minutes) — the spine of the demo

> **Purpose:** one medicine, one dose, one tap, five database writes, three users updated.

### 2.1 Caregiver writes the plan

Phone A → **Meds** → **Add medication** (`C-03`).

| Field group | Value to type | Why it matters |
|---|---|---|
| **Medication name** | `Metformin` | |
| **Strength / form** | `500 mg tablet` | |
| **Form** | Tablet | |
| **Instructions** | `Take 1 tablet after meals` | Shown to the elder verbatim; never generated |
| **Schedule dates** | Start = today, no end date | |
| **Dose amount / Unit** | `1` / `tablet` | The unit must match the stock unit |
| **Time** | **now + 5 minutes** | So the dose becomes *Due* during the demo |
| **Repeat days** | **today's weekday only** | One occurrence today |
| **Grace period** | `120` minutes | The window before it turns *Missed* |
| **Stock batch** | Track stock **on**, quantity `30`, unit `tablet`, lot `LOT-A1`, expiry **+6 months**, low-stock `7`, refill contact | Enables the stock decrement |

Tap **Save medication** → the app opens **Medication details**.

**Say:** *"Nothing here is inferred. Every field came from the caregiver. There is no OCR, no
suggestion engine, and the app will not invent a dose."*

### 2.2 The dose appears on both phones

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | B | **Today** (pull to refresh) | The dose card under "Your doses today" |
| 2 | A | **Dashboard** (pull to refresh) | The same dose under "Still to come today" |

**What happened:** the screen calls `ensure_dose_events(elder_id)`, which generates today's
occurrence from the schedule. Idempotent by a unique occurrence key, so refreshing cannot duplicate it.

**Say:** *"The dose row is generated by the database from the schedule — not by a phone alarm, and not
by the elder's device."*

### 2.3 The elder confirms — once

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | B | The dose card | **Dose** detail: medicine, strength, instructions, "Scheduled for HH:MM", "1 tablet" |
| 2 | B | **Mark as taken** — a 56 dp button, once | Screen becomes **Confirmed**: "Taken at HH:MM" and "This action cannot create a duplicate confirmation." |

The button disappears after success. That is the visual proof of idempotency at the UI level.

### 2.4 What one tap wrote (say this while it lands)

> "That single tap ran one guarded database function, `confirm_dose`, inside one transaction. It wrote
> **five** things: the `taken_at` timestamp on the dose, a −1 on the batch, one row in the stock ledger,
> one row in the audit log, and one notification for the caregiver. If any part failed, none of it
> would be committed."

| Table | Change |
|---|---|
| `dose_events` | `taken_at` set, `settled_by = 'elder'` |
| `medicine_batches` | `quantity = 29` |
| `inventory_transactions` | one row, `source_dose_event_id` = this dose |
| `audit_events` | one row, `action = 'dose.confirmed'` |
| `notifications` | one row, `event_type = 'dose_confirmed'`, recipient = caregiver |

### 2.5 The caregiver sees it **without touching the phone**

| # | Phone | Action | What happens |
|---|---|---|---|
| 1 | A | **Do not touch it.** Watch the dashboard | The stat tiles move: Taken +1, Still to come −1, and "Recent confirmations" gains the row with **Stock −1 tablet** |

**Say:** *"That was not a refresh. Realtime published the `dose_events` change and the caregiver's
dashboard subscribed to it. Realtime is only a mirror — RLS still decides which rows each subscriber
may receive, and the screen also refetches on focus, so nothing is lost if the socket drops."*

### 2.6 The notification

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | The **bell** in the header | **Notifications** with "Unread: 1" |
| 2 | A | The row | Opens the dose record for this role |
| 3 | A | **Mark all read** | Unread returns to 0 |

**Say:** *"The notification row carries the event type and which table the target lives in, so the same
notification can open a dose for the caregiver and a medicine for someone else — it never assumes every
alert is a dose. All of this is in-app; there is no push service on the free tier."*

### 2.7 The family member sees it read-only

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | C | **Home** (pull to refresh) | The dose status card in the activity list |
| 2 | C | **Meds** → the medicine | Read-only detail: instructions, schedule, stock, prescription photos |
| 3 | C | Look for an edit control | **There is none** — and the write RPCs are not even offered |

### 2.8 Prove the stock moved

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | **Meds** → **Metformin** | **Stock** card: quantity 29, lot, expiry, low-stock threshold |
| 2 | A | **Recent adherence** card | The confirmation just recorded |

**Cycle complete.** One caregiver write, one elder tap, five database rows, three screens updated,
nothing deleted, nothing duplicated.

---

## Act 3 · Every other module (10 minutes)

> **Purpose:** prove the app is complete, not just one happy path. Each block is 60–90 seconds and each
> one reuses the same three-user structure.

### 3.1 Inventory, stock and expiry — `C-04`

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | Meds → medicine → **Adjust stock** | Dialog: **Change** (+/−), **Reason**, **Note (optional)** |
| 2 | A | `+10`, reason *Restock*, **Save adjustment** | Quantity 39; a stock row appears in Care activity |
| 3 | A | **Adjust stock** → `−37`, reason *Damaged* | Quantity 2 → the card now shows **Low stock** with a label, not just a colour |
| 4 | A | Set the low-stock threshold above the quantity | The threshold is what drives the *Low* state |

**Be honest about timing:** the **Low** badge is derived on the client the moment the screen loads. The
`stock_low` *notification* is written by a daily sweep (`check_inventory_alerts`, 07:00), so do not
promise it will appear live.

**Say:** *"Stock is a ledger, not a number we overwrite. Every adjustment is a signed
`inventory_transactions` row plus an audit row, so you can always reconstruct why the count is what it
is. Expiry is tracked per batch, and an expired batch suppresses new doses for that medicine."*

### 3.2 Prescription photos — the 3rd-increment remark, closed

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | Meds → medicine → **Prescription photos** → **Add prescription photo** | **Take photo** / **Choose from library** |
| 2 | A | Choose a photo | Thumbnail appears in the card |
| 3 | B | **Meds** → the medicine | The same photo, read-only, compact |
| 4 | C | **Meds** → the medicine | The same photo, read-only |
| 5 | A | **Remove** → **Remove photo** | The row is **archived**, not deleted |

**Say:** *"The bucket is private. The image loads through a short-lived signed URL generated for this
circle — there is no public URL. Removing a photo archives the row and the object and writes an audit
entry. That was the remark from the third increment: the photo is here, and there is still **no OCR** —
nothing reads the image and auto-fills a medicine."*

### 3.3 A missed dose — the honest one

Two ways to show it, in order of reliability:

**Reliable (derived status):** add a second medicine scheduled **2 hours ago** with grace **1 minute**.
Open Phone B's Today → the card reads **Missed**; Phone A's Dashboard → it appears under **Needs
attention**. This works because status is derived from the schedule at screen load.

**Less reliable (the sweep):** the `dose_missed` *notification* is written by `transition_missed_doses`,
which runs every 5 minutes. It may not land during the demo.

**Say:** *"A missed dose is not an accusation and not advice. The screen says ElderCare+ does not advise
whether a late dose should be taken — that is a clinical decision, and it routes to the caregiver."*

### 3.4 Appointments — `C-06`, `C-07`, `C-08`

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | **Calendar** → **Add appointment** | Type, Title, Date, Time; Clinic, Location, Doctor, Address; Visitor, Contact; Notes; **Remind me** lead; **Remind the older adult** |
| 2 | A | Save | Appointment in the list |
| 3 | B | **Calendar** and **Today** | The appointment, read-only, and "Next appointment" on the home screen |
| 4 | C | **Visits** | The same appointment, read-only |
| 5 | A | Open it → **Complete** (with a note) | State becomes completed; an audit row is written |

**Say:** *"Appointments are state machines, not free text. Upcoming → completed or cancelled, each with a
note, each audited, and a past state is never overwritten silently."*

### 3.5 The help circle — Flow F

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | B | **Today** → **Ask for help** | **Kind of help** (Urgent / Practical / Companionship) + **Note (optional)** |
| 2 | B | **Ask for help** | The request appears in *Your requests* as **Open** |
| 3 | A | **Help requests** (from the bell or the tab) | The request as **Open** → **Offer to help** |
| 4 | C | **Help** tab | Same request; **Offer to help** → becomes **Accepted** and names who took it |
| 5 | C | **Mark as done** | **Completed** |
| 6 | B | Pull to refresh | The request shows **Completed** |

> Only one member can claim it: the server rejects a second acceptance.

### 3.6 Availability — the family's own setting

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | C | **More** → **My availability** | **I am** Available / Not available + **Note** |
| 2 | C | **Save availability** | The card "Who is available" lists the circle |
| 3 | B | Care circle / help screens | Who is available to help |

**Say:** *"This is the family member's one write. It is their own row — they still cannot touch the
medical record."*

### 3.7 Reports, adherence and the activity timeline

| # | Phone | Tap | What she sees |
|---|---|---|---|
| 1 | A | **Reports** → **Period** 7 / 30 / 90 | **Confirmation rate** %, taken / missed / still due |
| 2 | A | Scroll | **Day by day** and **Missed doses** for the period |
| 3 | A | **Care activity** | Filters **Everything / Care changes / Stock** and a medicine filter |
| 4 | B | **Today** → **My adherence** | The same range, scoped to the elder alone |
| 5 | C | **Family view** → **Care summary** chips | 7 / 30 / 90 counts |

**Say honestly:** *"The report returns per-day counts and totals. It does **not** break down per
medicine — I am stating that limit rather than implying it exists. The family summary is counts only:
no dose, no medicine, no timestamp, because it is an aggregate, not the record."*

The **Care activity** list is the audit trail rendered in plain language: dose confirmations, stock
adjustments, photo archives, care-link changes — newest first, append-only.

### 3.8 Emergency card — always one tap

| # | Phone | Tap | What she sees |
|---|---|---|---|
| 1 | B | **Emergency** tab | Who I am, blood type, conditions, allergies, **contacts (tap to call)**, care instructions, doctor, address, medicines |
| 2 | A | **Profile** → elder profile → **Emergency contacts** | **Add contact**, **Verify**, **Edit**, **Move up / Move down**, **Deactivate** |
| 3 | B | Pull to refresh | The updated, ordered contact list |

**Say:** *"The elder cannot edit this — the caregiver owns it. Contacts are ordered deliberately, the
first one is the tap-to-call target, and deactivating keeps the history."*

### 3.9 The care circle and revoke — the consent lifecycle closes

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | B | **Today** → **Care circle** | "Who can see your record" with each member and **Access active** |
| 2 | B | Remove the family member → confirm dialog | Status revoked |
| 3 | C | Pull to refresh | "Your access was removed. Ask them for a new invite code…" |
| 4 | A | Care links | The family invite shows the revoked state |

**Say:** *"Consent is not a checkbox at sign-up. It is a row that the elder owns, that can be withdrawn at
any time, and both granting and withdrawing are audited."*

---

## Act 4 · Security (6 minutes)

This is the segment the security subject is checking. Do it in this order.

### 4.1 Password policy — server-enforced

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | Welcome → **Create an account** → type `abc12345` → **Create account** | **"Use at least 10 characters."** — the request never leaves the phone |
| 2 | Laptop | `curl` the same weak password at `/auth/v1/signup` | `422 weak_password`, reasons `length`, `characters` |

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"policy@example.com","password":"abc12345"}'
```

**Say:** *"The form copy exists so the elder is not sent on a round-trip. The authority is the server:
GoTrue rejects the same password with `weak_password`. Existing 8-character demo accounts still sign in,
because the policy is validated at signup and password change, not at login."*

### 4.2 App lock and biometrics

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | **Profile** → **Security** card | "App lock: On. After 2 minutes in the background this app asks for your fingerprint or your password." |
| 2 | A | **Lock now** | The system fingerprint prompt |
| 3 | A | Cancel it | The app's own lock screen: **no email, no medicines** — only the account name |
| 4 | A | **Unlock with password** → the password | Back to Profile |
| 5 | A | Home button, wait 2 minutes, reopen | Locked again, fingerprint prompt first |

**Say:** *"The lock is not a client flag. The password path calls `reauthenticate`, which is a real
sign-in against Supabase Auth. The fingerprint never leaves the phone — the Android Keystore verifies it
and the app receives a yes/no. Five wrong passwords pause the keypad for 30 seconds."*

**If she asks about a phone left on a table:** that is exactly what this defends — the session stays in
the keystore, but the screen is shut.

### 4.3 Row-level security — no token, no rows

```bash
curl -s "$SUPABASE_URL/rest/v1/medications?select=id" -H "apikey: $ANON"
# → 401 / 42501: no policy for anon
```

| # | Phone | Action | What she sees |
|---|---|---|---|
| 1 | C | Any screen | No edit, add or remove control anywhere |
| 2 | Laptop | The `curl` above | Refused |

**Say:** *"RLS is on every table with default deny. The elder can write exactly one thing — their own
due dose — and only through `confirm_dose`. The family member's reads are scoped by a policy that joins
`care_links` and requires `status = 'active'`."*

### 4.4 Guarded functions and re-authentication

| # | Phone | Tap | What appears |
|---|---|---|---|
| 1 | A | **Care links and invites** → withdraw family consent | A dialog asks for the password |
| 2 | A | Enter it | The link is revoked and audited |

**Say:** *"The server checks the token's `amr` array — a password sign-in within 300 seconds. A stale
token is rejected with `insufficient_privilege`. A client boolean is never accepted as proof."*

### 4.5 Private prescription storage

Covered in §3.2. One extra line for the security audience:

> "The bucket is private, the `storage.objects` policies are scoped to the circle, and only the linked
> manager can write. The elder and the family member read through signed URLs that expire."

### 4.6 Idempotency — the headline claim (laptop, 90 seconds)

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

**Say:** *"Three guards, all in the database: a unique dose-occurrence key, a conditional update that
only succeeds while `taken_at is null`, and a unique stock-decrement key. This is the requirement that
survives an offline retry — the elder's phone can retry a hundred times and the ledger still has one
row."*

### 4.7 Audit trail

Phone A → **Reports → Care activity**: `dose.confirmed`, the stock adjustment, the photo archive, the
care-link revocation — newest first.

> "Medical history is append-only. Nothing is hard-deleted; a record is archived or deactivated with a
> timestamp and an audit row."

---

## Act 5 · Close (30 seconds)

> "That is ElderCare+: three roles on one database, one guarded write from the older adult, and every
> read scoped by row-level security. The caregiver owns the plan, the older adult owns the confirmation,
> the family sees only what the older adult approved — and nothing in the medical history is ever
> deleted."

---

# Part 3 — Reference appendices

## Appendix A · Every screen in the app

Route paths are as they exist under `apps/mobile/src/app/`. `(auth)`, `(caregiver)`, `(elder)` and
`(family)` are route groups, so they do not appear in the URL.

### Auth and shared

| Screen | Route | Title shown | Purpose |
|---|---|---|---|
| Entry gate | `/` | — | Reads `profiles.role`, redirects to the right shell; fails closed with no profile |
| Welcome | `/welcome` | ElderCare+ · Family care coordination | Two actions: Sign in, Create account |
| Sign in | `/sign-in` | Sign in | Email + password |
| Sign up | `/sign-up` | Create account | Name, email, password ×2, role card |
| Notifications | `/notifications` | Notifications | Every event for this user, unread count, Mark all read, row opens its target |

### Caregiver (`caregiver`)

| Screen | Route | Title shown | Purpose |
|---|---|---|---|
| Dashboard | `/caregiver` | Dashboard | Today's tiles, 7-day adherence, next appointment, needs attention, recent confirmations, bell |
| Medications | `/caregiver/meds` | Medications | Active/Inactive filter, stock state per medicine, Add medication |
| Add medication | `/caregiver/med-new` | Add medication | Plan, schedule, batch in one form |
| Edit medication | `/caregiver/med-edit` | Edit medication | Same form, pre-filled |
| Medication details | `/caregiver/med` | Medication details | Instructions, active schedule, stock, prescription photos, recent adherence, adjust stock, activate/deactivate |
| Dose detail | `/caregiver/dose` | Dose | Read-only view of one dose; explains the missed state |
| Calendar | `/caregiver/calendar` | Calendar · Appointments | List with Upcoming/Completed/Cancelled filter, Add appointment |
| New/edit appointment | `/caregiver/appointment-edit` | New appointment / Edit appointment | Type, title, when, where, who, notes, reminder |
| Appointment detail | `/caregiver/appointment` | Appointment | Read, complete, cancel |
| Reports | `/caregiver/reports` | Reports | Period chips, confirmation rate, day by day, missed doses, link to activity |
| Care activity | `/caregiver/activity` | Care activity · Care changes and stock | The audit trail + stock ledger, filterable |
| Help requests | `/caregiver/help` | Help requests · From the older adult | Offer to help, Mark as done |
| Care links | `/caregiver/link` | Care links · Codes and invites | Create link code, invite family by email, your invites, remove link |
| Elder profile | `/caregiver/elder` | Elder profile | Read the profile and emergency contacts |
| Create elder profile | `/caregiver/elder-new` | Create elder profile | First-time setup after linking |
| Edit elder profile | `/caregiver/elder-edit` | Edit elder profile | Identity, medical summary, doctor, address, emergency contacts |
| Profile | `/caregiver/profile` | Profile · Your account | Account, linked elder, deactivate, Security card, sign out |

### Elder (`elder`)

| Screen | Route | Title shown | Purpose |
|---|---|---|---|
| Today | `/elder` | Today | Greeting, dose summary, next appointment, dose cards, My adherence, Care circle, Ask for help, Emergency |
| Meds | `/elder/meds` | Meds · What you take | Read-only plan with prescription photos |
| Dose / Confirmed | `/elder/dose` | Dose → Confirmed | The one write: **Mark as taken** |
| Calendar | `/elder/calendar` | Calendar · Appointments | Read-only appointments |
| Appointment | `/elder/appointment` | Appointment | Read-only detail |
| Emergency | `/elder/emergency` | Emergency · Show this to anyone helping you | Identity, health, tap-to-call contacts, instructions, doctor, address, medicines |
| Care circle | `/elder/circle` | Care circle · Who can see your record | Approve access, remove access |
| Link a caregiver | `/elder/link` | Link a caregiver | Six-digit code entry |
| Ask for help | `/elder/help` | Ask for help · Your family and caregiver are told | Category + note, withdraw |
| My adherence | `/elder/adherence` | My adherence | 7/30/90 personal report |
| Profile | `/elder/profile` | Profile · Your account | Account, data statement, deactivate, Security card, sign out |

### Family (`family`)

| Screen | Route | Title shown | Purpose |
|---|---|---|---|
| Family view | `/family` | Family view · Read-only access | Who they see, Care summary chips, activity, shortcuts |
| Medicines | `/family/meds` | Medicines · Read-only | The plan, no controls |
| Medicine | `/family/med` | Medicine | Read-only detail with photos |
| Visits | `/family/calendar` | Visits | Appointments, read-only |
| Appointment | `/family/appointment` | Appointment | Read-only detail |
| Help | `/family/help` | Help · From the older adult | Offer to help, Mark as done |
| Help detail | `/family/help-detail` | Help | One request |
| More | `/family/more` | More · Read-only access | Elder profile, Emergency, Care circle, My availability, deactivate, Security card, sign out |
| Elder profile | `/family/elder` | Elder profile | Read-only |
| Emergency | `/family/emergency` | Emergency | Read-only |
| Care circle | `/family/circle` | Care circle · Read-only | Who else is in the circle |
| Availability | `/family/availability` | Availability · Help the circle plan | Own availability + who is available |
| Enter an invite code | `/family/link` | Enter an invite code | Join the circle, pending the elder's approval |

## Appendix B · Function map — where every call is used

Grouped by domain. "RPC" is the `security definer` database function; the tables are what it touches.

### Care links and consent

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `createElderLinkInvite` | `create_elder_link_invite` | `care_link_invites`, `audit_events` | Caregiver → Care links → **Create a link code** |
| `inviteFamilyMember` | `invite_family_member` | `care_link_invites`, `audit_events` | Caregiver → Care links → **Create an invite code** |
| `redeemCareLinkCode` | `redeem_care_link_code` | `care_link_invites`, `care_links`, `audit_events` | Elder → Link a caregiver; Family → Enter an invite code |
| `consentToCareLink` | `consent_to_care_link` | `care_links`, `audit_events` | Elder → Care circle → **Approve access** |
| `revokeCareLink` | `revoke_care_link` | `care_links`, `audit_events` | Elder → Care circle → remove; Caregiver → **Remove this link** |
| `deactivateAccount` | `deactivate_account` | `profiles`, `care_links`, `audit_events` | Profile → Deactivate |

### Medication plan

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `createMedication` | `create_medication` | `medications`, `audit_events` | Add medication |
| `updateMedication` | `update_medication` | `medications`, `audit_events` | Edit medication |
| `setMedicationActive` | `set_medication_active` | `medications`, `dose_events`, `audit_events` | Medication details → Activate/Deactivate |
| `createSchedule` | `create_schedule` | `medication_schedules`, `audit_events` | Add medication → dose and times |
| `updateSchedule` | `update_schedule` | `medication_schedules`, `audit_events` | Edit medication |
| `setScheduleActive` | `set_schedule_active` | `medication_schedules`, `audit_events` | Edit medication |
| `createBatch` | `create_batch` | `medicine_batches`, `audit_events` | Stock batch section |
| `updateBatch` | `update_batch` | `medicine_batches`, `audit_events` | Edit medication |
| `setActiveBatch` | `set_active_batch` | `medicine_batches`, `audit_events` | Medication details |
| `deactivateBatch` | `deactivate_batch` | `medicine_batches`, `audit_events` | Medication details |
| `adjustStock` | `adjust_stock` | `inventory_transactions`, `audit_events` | Medication details → **Adjust stock** |

Internal to the database (never called from the app): `assert_medication_fields`,
`assert_batch_fields`, `assert_valid_timezone`, `canonicalize_days_of_week`, `medicine_has_any_batch`,
`medicine_has_valid_active_batch`, `medicine_suppresses_doses`, `reconcile_*`,
`cancel_future_dose_events`, `batch_audit_summary`, `schedule_audit_summary`,
`medication_audit_summary`, `medication_elder_id`, `batch_elder_id`.

### Doses — the confirmation loop

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `ensureDoseEvents` | `ensure_dose_events` | `dose_events` | Every home screen load (elder, caregiver, family) |
| `markDoseTaken` | `confirm_dose` | `dose_events`, `medicine_batches`, `inventory_transactions`, `audit_events`, `notifications` | Elder → dose → **Mark as taken** |
| `flushDoseOutbox` | `confirm_dose` (retry) | same | Every screen load while a confirmation is queued offline |

Internal / scheduled: `generate_dose_events_for`, `transition_missed_doses` (every 5 minutes),
`check_inventory_alerts` (daily 07:00), `local_dose_timestamp`, `notify_dose_event`,
`dose_event_audit_summary`.

The offline outbox is local SQLite only (`apps/mobile/src/db/dose-outbox.ts`): a failed confirmation is
queued, the screen says **"Pending sync. Do not tap again."**, and the retry is safe because
`confirm_dose` is idempotent.

### Inventory and alerts

| App / database | RPC | Tables |
|---|---|---|
| `adjustStock` | `adjust_stock` | `inventory_transactions`, `audit_events` |
| daily sweep | `check_inventory_alerts` | `medicine_alert_state`, `notifications` |
| `inventory_transactions_append_only` | trigger | `inventory_transactions` |
| `medicine_alert_state` | dedup | one alert per low/out/expiring episode |

### Reports and history

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `getAdherenceReport` | `get_adherence_report` | `dose_events` (aggregate) | Caregiver Reports, Elder My adherence, Family Care summary |
| `listCareActivity` | — (direct read) | `audit_events`, `inventory_transactions` | Caregiver → Care activity |
| `listDoses`, `listDosesForDay`, `listRecentConfirmations` | — | `dose_events` | Dashboards, calendar, family home |
| `getDoseStockOutcome` | — | `inventory_transactions` | "Stock −1 tablet" on the caregiver dashboard |

### Appointments

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `createAppointment` | `create_appointment` | `appointments`, `audit_events` | Add appointment |
| `updateAppointment` | `update_appointment` | `appointments`, `audit_events` | Edit appointment |
| `completeAppointment` | `complete_appointment` | `appointments`, `audit_events` | Appointment detail |
| `cancelAppointment` | `cancel_appointment` | `appointments`, `audit_events` | Appointment detail |

Scheduled: `check_appointment_reminders` (every 15 minutes) → `appointment_upcoming` notifications.
Internal: `assert_appointment_fields`, `appointment_apply_fields`, `appointment_audit_summary`.

### Help circle and availability

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `createHelpRequest` | `create_help_request` | `help_requests`, `notifications`, `audit_events` | Elder → Ask for help |
| `acceptHelpRequest` | `accept_help_request` | `help_requests`, `notifications`, `audit_events` | Caregiver/Family → **Offer to help** |
| `completeHelpRequest` | `complete_help_request` | `help_requests`, `notifications`, `audit_events` | Caregiver/Family → **Mark as done** |
| `cancelHelpRequest` | `cancel_help_request` | `help_requests`, `notifications`, `audit_events` | Elder → **Withdraw** |
| `setMemberAvailability` | `set_member_availability` | `member_availability`, `audit_events` | Family → My availability |

Internal: `notify_help_request`.

### Elder profile, emergency and photos

| App function | RPC | Tables | Used on |
|---|---|---|---|
| `upsertElderProfile` | `upsert_elder_profile` | `elder_profiles`, `audit_events` | Create/edit elder profile |
| `upsertEmergencyNumber` | `upsert_emergency_number` | `emergency_numbers`, `audit_events` | Emergency contacts → Add/Edit |
| `setEmergencyNumberVerified` | `set_emergency_number_verified` | `emergency_numbers`, `audit_events` | **Verify** |
| `reorderEmergencyNumbers` | `reorder_emergency_numbers` | `emergency_numbers`, `audit_events` | **Move up / Move down** |
| `deactivateEmergencyNumber` | `deactivate_emergency_number` | `emergency_numbers`, `audit_events` | **Deactivate** |
| `uploadMedicationImage` | `register_medication_image` | `medication_images`, `audit_events` + Storage | Prescription photos → Add |
| `archiveMedicationImage` | `archive_medication_image` | `medication_images`, `audit_events` | Prescription photos → Remove |
| `getMedicationImageUrl` | — (Storage signed URL) | `storage.objects` | Rendering a photo |

Internal: `ensure_single_primary`.

### Notifications and audit

| App function | RPC | Tables |
|---|---|---|
| `listNotifications` | — | `notifications` |
| `countUnreadNotifications` | — | `notifications` |
| `markNotificationsRead` | `mark_notifications_read` | `notifications` |
| `markAllNotificationsRead` | `mark_all_notifications_read` | `notifications` |

`audit_events` has no client write path at all: rows are appended by the guarded RPCs and triggers,
and `audit_events_append_only` blocks update and delete.

## Appendix C · Who can do what

| Capability | Caregiver | Elder | Family member |
|---|---|---|---|
| Create/edit medicine, schedule, batch | ✅ | ❌ | ❌ |
| Adjust stock | ✅ | ❌ | ❌ |
| Confirm a due dose | ❌ | ✅ own only, via `confirm_dose` | ❌ |
| Add/complete/cancel appointment | ✅ | ❌ (read) | ❌ (read) |
| Edit elder profile / emergency contacts | ✅ | ❌ | ❌ |
| Read elder profile / emergency card | ✅ | ✅ | ✅ read-only |
| Upload / archive prescription photo | ✅ | ❌ (read) | ❌ (read) |
| Create link code / invite family | ✅ | ❌ | ❌ |
| Redeem a code | ❌ | ✅ caregiver code | ✅ invite code |
| Approve or remove family access | ❌ | ✅ | ❌ |
| Remove the caregiver link | ✅ (their own link) | ✅ | ❌ |
| Create / accept / complete help request | ✅ accept/complete | ✅ create/withdraw | ✅ accept/complete |
| Set own availability | ❌ | ❌ | ✅ |
| Read reports and activity | ✅ full | ✅ own | ✅ aggregate only |
| Deactivate own account | ✅ | ✅ | ✅ |

## Appendix D · What runs by itself

| Job | Schedule | Effect |
|---|---|---|
| `transition_missed_doses` | every 5 minutes | Settles a dose as missed after its grace period and notifies the caregiver |
| `check_inventory_alerts` | daily, 07:00 | Low stock, out of stock, expiring batch notifications (deduplicated) |
| `check_appointment_reminders` | every 15 minutes | `appointment_upcoming` notifications at the lead time |
| `ensure_dose_events` | on every home-screen load | Generates today's occurrences from the active schedules |
| Realtime publication | continuous | Mirrors `dose_events`, `help_requests`, `notifications` to subscribed clients |

**Stage rule:** only the first two are worth mentioning, and always as "it runs on a schedule" — never
claim you watched it happen if you did not.

## Appendix E · Likely questions

| Question | Answer |
|---|---|
| Why three roles? | `adr-001`: the approved scope needs a read-only family member, modelled as care-circle membership, not a second account type. |
| Where is the password stored? | Supabase Auth (GoTrue) hashes it server-side; the app sends it once and stores only the session, in the device keystore. |
| Why no email verification? | Synthetic accounts and no mail service on the free tier. The server still enforces password policy, rate limits and RLS. |
| What happens offline? | A confirmation queues in a local outbox and retries; `confirm_dose` is idempotent, so a retry cannot duplicate a dose or a stock decrement. |
| Is there AI? | No. Prescription photos are storage only — no OCR, nothing auto-fills a medicine. That keeps "never suggest or change a dose" structural. |
| Can the caregiver confirm a dose for the elder? | No. `confirm_dose` requires the elder's own session; the caregiver's token is refused. |
| Can the caregiver grant family access? | No. They can invite; only the elder can approve. |
| Can the elder edit their medical profile? | No. They can confirm doses, ask for help, and manage consent. |
| Is anything ever deleted? | No. Deactivate or archive with a timestamp, plus an audit row. |
| How do you know the numbers are real? | 19 migrations, 641 pgTAP assertions, 199 JS tests, all run locally; every claim in this script was executed on the emulator. |

## Appendix F · If something breaks

| Symptom | Do this |
|---|---|
| A tap closes the app | Old bundle. The current APK is `versionCode` 6; force-stop and reopen in the meantime. |
| Realtime row does not move | Pull to refresh — the documented fallback. Do not claim Realtime worked if it did not. |
| Fingerprint prompt does not appear | Use **Unlock with password**; the password path is the fallback by design. |
| App locked itself mid-demo | That is the lock working. Unlock and continue; it is also a talking point. |
| Low-stock notification does not appear | Expected: the sweep is daily. Show the **Low** badge instead and explain. |
| Missed notification does not appear | Expected within up to 5 minutes. Show the derived **Missed** status instead. |
| Hosted project paused | Open the app once, wait ~30 s, retry. |
| A query returns rows it should not | Stop. The RLS claim is the one to protect — do not improvise. |

## Appendix G · Evidence to capture

1. Caregiver dashboard after the elder's confirmation (Taken + timestamp + Stock −1).
2. Notification centre with the unread row, then after **Mark all read**.
3. Security card and the lock screen (no email, no medical data).
4. The second `confirm_dose` response (`duplicate: true`) and the three counts = 1.
5. SQL: the five rows written by one confirmation.
6. Family view showing the same dose, with no action buttons.
7. Care activity list showing dose, stock, photo archive, link revocation.
8. The APK build id and `versionCode` (Appendix H).

## Appendix H · Build of record

| Field | Value |
|---|---|
| EAS build id | `4baaa0d1-8208-4485-ac68-7bf9d4b5724e` |
| Commit | `5e6f27e` |
| `versionCode` | **6** |
| Fingerprint | `47bf46ed19e02f7aba7a65535c9ab304ccde69c3` |
| APK | `https://expo.dev/artifacts/eas/gAmYxK3ckCT8HTNSXByFKMNqLKC_CL4G80j80P0a2Oc.apk` |
| Verified | Installed on the Android emulator: sign-in, app lock, fingerprint unlock, password unlock, notification prompt |
