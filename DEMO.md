# ElderCare+ — class checking demo

This build answers the Mobile Application Development individual-project brief: login and logout,
authentication against a database, validation messages, UX extras, a logout confirmation, and **two
connected user roles with one working transaction between them**.

Nothing here is clinical. All people, medicines and schedules are synthetic fixtures.

## Run it

```bash
pnpm install
pnpm --filter mobile start        # then press "a" for Android, or scan the QR with Expo Go
```

No Docker, no network and no credentials are needed: the database is `expo-sqlite` on the device
(the brief allows "a local database or a cloud database"). It is created and seeded the first time
the app starts.

**Use a device or emulator — not the web target.** `expo start --web` fails to bundle because
`expo-sqlite`'s web worker cannot resolve its WASM file under this pnpm workspace.

## Working accounts

Both are seeded automatically. The password is the same for both so it is easy to type on stage.

| Role             | Email                 | Password   |
| ---------------- | --------------------- | ---------- |
| Family caregiver | `maria@eldercare.app` | `demo1234` |
| Older adult      | `ana@eldercare.app`   | `demo1234` |

You can also create a brand-new account: a new caregiver is linked to the demo older adult
automatically, and a new older adult gets a fresh day of doses so their dashboard is never empty.

## How the brief maps to the build

| Requirement                            | Where it lives                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Login and logout                       | `(auth)/sign-in.tsx`, `components/logout-button.tsx`                        |
| Sample dashboard after login           | `(elder)/elder/index.tsx` (Home), `(caregiver)/caregiver/index.tsx`         |
| Credentials checked against a database | `db/users.ts`, salted SHA-256 in `db/users.ts`, table in `db/database.ts`   |
| Inspect the database on screen         | `app/database.tsx` (caregiver Profile → **View database**), `db/inspect.ts` |
| Create account / registration          | `(auth)/sign-up.tsx` with a role choice                                     |
| Caregiver sets a medicine and schedule | `(caregiver)/caregiver/meds.tsx`, `createDose` in `db/doses.ts`             |
| Success and error messages             | `components/banner.tsx` + `auth/validation.ts`                              |
| Empty username or password             | "Enter your email and password to sign in."                                 |
| Incorrect username or password         | "Incorrect username or password. Please try again."                         |
| Account does not exist                 | "Account does not exist. Check the email address, or create an account."    |
| Successful login                       | green "Signed in successfully" banner before the dashboard opens            |
| Show / hide password                   | Show–Hide control inside every password field                               |
| Loading indicators                     | spinner inside the submit button and on every data screen                   |
| Form validation                        | per-field messages on blur and on submit, including password confirmation   |
| Logout confirmation                    | "Are you sure you want to logout/sign out?" with Cancel / Yes, sign out     |

## The transaction that connects the two roles

The caregiver sets the medicine and the schedule; the elder confirms a dose; the caregiver's
dashboard updates from the same record.

1. Sign in as **Maria** (`maria@eldercare.app`). On **Meds**, fill in a medicine and tap
   **Save medicine** — leave **Due now** selected so there is something to confirm straight away.
2. Log out (confirm the dialog), then sign in as **Ana** (`ana@eldercare.app`). Home shows the new
   dose as **Due**.
3. Tap **Mark as taken** (56 dp target). A success banner reports the time.
4. Log out and sign back in as **Maria**: **Meds** lists the new medicine, and the dashboard shows
   the claim under **Recent confirmations**, with the **Taken** count and the seven-day rate moved.

Confirmations are idempotent at the database level: the `taken_at IS NULL` guard in
`db/doses.ts` means a double tap or a retry cannot overwrite a timestamp or record a dose twice.

### Doing it again, without restarting the app

The loop is repeatable on stage. Run steps 1–4 as many times as you like:

- **Caregiver side:** every **Save medicine** adds a new due dose for the elder.
- **Elder side:** if nothing is due, a fresh due dose is added automatically, so **Mark as taken**
  is always available. Nothing is deleted, so the care plan the caregiver has built up is kept.

Reload the app (terminal `r`, or shake the device and tap **Reload**) only if you want to start the
day over from scratch — it is not needed to repeat the flow.

## Showing the database (for checking)

The app has one datastore: the on-device SQLite file `eldercare.db`, with tables `users`,
`care_links` and `doses`. To show it on the phone, sign in as **Maria**, open the **Profile** tab and
tap **View database** under **Local database**. The screen lists every table, its row count and its
latest rows (newest first, capped at 25 per table — pull down to refresh). It is read-only: it only
runs `SELECT`/`PRAGMA`, and password hashes are masked.

That is the database the app really reads and writes. The Supabase/Postgres schema under `supabase/`
is a separate, not-yet-connected design — do not present it as this app's live data (see
**Known limits**).

## Messages to show during checking

- Empty form → tap **Sign in** with both fields blank.
- Bad email → type `maria` and submit.
- Unknown account → `nobody@example.com` + any password.
- Wrong password → `ana@eldercare.app` + `wrongpass`.
- Success → `ana@eldercare.app` + `demo1234`.
- Logout → Profile tab, **Log out**, then **Cancel** (stays), then **Yes, sign out** (leaves).
- Empty medicine → on **Meds** (as Maria), tap **Save medicine** with the fields blank.

## Known limits (honest list)

- Password hashing is a salted SHA-256, not a password KDF. Production uses Supabase Auth; this is
  the local-database build the brief asked for.
- The session is in memory, so a cold start returns to the welcome screen. That is deliberate for a
  login demonstration.
- **Appointments are not built.** The Calendar tab shows a deliberate empty state rather than fake
  rows.
- **Reports cover confirmation history only** — the 7-day confirmation rate and a day-by-day
  breakdown. No other reporting exists yet.
- The third role (connected family member) is not built.
- **The app is not connected to Supabase yet.** It reads and writes on-device `expo-sqlite`; the
  Supabase schema and its RLS are a separate, later cutover.
- Scheduling is still demo scaffolding: `db/demo.ts` seeds a day and adds a due dose when nothing is
  due so a demonstration cannot dead-end on the clock, and `db/doses.ts` has no medicine catalogue —
  each dose carries its medicine inline. Both are marked in the code.
