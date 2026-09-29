# Review & rebuild guide — scaffold to the Sprint 1b starting line

A guided tour of everything built so far (2026-09-23 → 2026-09-27), written so you can
both **review** the existing work and **rebuild it yourself** to learn the method.
Scope stops where Sprint 1b begins; Sprints 2–9 are deliberately not covered.

Two ways to use this:

- **Review mode** — the code exists; walk the stations in order and prove each one
  (read → run → explain back).
- **Rebuild mode** — you want to learn by constructing it again; do the *Rebuild*
  exercise at the end of each station before moving on.

> **The only rule that matters while using this guide:** do not move to the next
> station until you can explain the current one out loud, in your own words, without
> looking at the code. The explain-back prompts are the real test. If you can't, the
> station isn't done.

---

## 0. The method behind everything

Four principles this repo lives by. Learn these first — they explain *why* the code
looks the way it does.

1. **One source of truth per concern, and conflicts get decided, not drifted.**
   - Product scope → `docs/00-product-flow.md`
   - Tooling → `docs/01-dev-environment.md`
   - UI/UX → `docs/02-ui-ux-standard.md`
   - The approved PDFs are authoritative on screens and visual identity until a
     written decision records otherwise.

   When the design PDFs disagreed with the product flow, the fix was four ADRs
   (`docs/adr/adr-001…004`), not silent edits. A future reader can always see *what*
   was decided and *why*.

2. **Spec first, then implement.**
   `docs/specs/sprint-N.md` defines: goal, user stories, acceptance criteria, screens,
   data touched, out-of-scope. `@architect` critiques it *before* code starts
   (`docs/01-dev-environment.md` §10). Acceptance criteria get transcribed into tests,
   so "done" is provable, not asserted.

3. **Schema first, app second.**
   Sprint 1 deliberately did **not** touch the mobile app. The database, its policies
   and its tests were reviewed on their own; the mobile cutover is a separate sprint
   (1b) with its own spec. This keeps security reviewable in isolation.

4. **Security and idempotency are database properties, not client promises.**
   RLS is default-deny. The elder's only write is a guarded RPC. A retried redemption
   cannot duplicate a link, and a retried dose confirmation cannot overwrite a
   timestamp. Append-only means *the database itself refuses* UPDATE and DELETE.

---

## 1. Orientation run (do this before reading anything)

### Workspace gates

```bash
pnpm install
pnpm typecheck        # strict TS across the monorepo
pnpm lint
pnpm test             # workspace tests: 22 at the Sprint 1 tag, 35 on the Sprint 1b branch
pnpm format:check
pnpm check:contrast   # token contrast checker, scripts/check-contrast.mjs
```

### The mobile demo (needs Expo Go or an Android emulator)

```bash
pnpm --filter mobile start
```

Then follow `DEMO.md`:

- Sign in as **Maria** (`maria@eldercare.app`) / **Ana** (`ana@eldercare.app`),
  password `demo1234` (synthetic accounts, seeded automatically).
- Caregiver adds a medicine → elder confirms the dose → caregiver dashboard updates.
- Caregiver **Profile → View database** shows the on-device SQLite tables live.

### The Supabase schema (needs Docker Desktop)

```bash
npx supabase start
npx supabase db reset      # applies all 6 migrations + seed.sql
npx supabase test db       # current total: 124/124 pgTAP assertions
npx supabase studio        # optional: inspect tables, policies, functions
```

### The honest status you must hold in your head

There are **two data layers** in this repo and they are **not connected**:

| Layer | Where | State |
|---|---|---|
| On-device SQLite demo | `apps/mobile/src/db/` | Running; what the app really reads/writes |
| Supabase product schema | `supabase/migrations/` | Built and tested; **not yet wired to the app** (that's Sprint 1b) |

`DEMO.md`'s "Known limits" list is the ground truth. Never present the Supabase schema
as connected before Sprint 1b lands.

---

## 2. Timeline — what actually happened, in order

`git log --oneline --reverse` shows this story. 17 commits, five phases:

### Phase A — Scaffold (Sep 23)

| Commit | What | Why it matters |
|---|---|---|
| `bb50848` | Monorepo scaffold | pnpm workspace, strict TS, layout, CI skeleton |

### Phase B — Contracts and decisions (Sep 24–25)

| Commit | What | Why it matters |
|---|---|---|
| `d6433cd` | Shared status-presentation contract, dose tests, contrast tooling | UI states are derived from data, not stored; contrast is machine-checked |
| `0e82b81` | UI/UX standard, ADR briefs, approved PDFs | The conflicts (C-R1…C-R4) become visible and get options |
| `1f2c293` | Local SQLite demo app | The runnable class demo: two roles, one transaction |
| `db675f7` | Demo script (`DEMO.md`) | The demo is rehearsable and honest about limits |
| `9c5afe5` | Docs drift corrections | Status text must never claim more than the code does |
| `6cb18be` | ADR-001…004 accepted; three-role scope aligned | The third role (family member) is decided and recorded |

### Phase C — Sprint 1 schema (Sep 25)

| Commit | What | Why it matters |
|---|---|---|
| `640729b` | Accounts, care circle, RLS, RPCs, audit, tests | The real product database; spec `docs/specs/sprint-1.md` |

### Phase D — Demo polish (Sep 25)

| Commit | What | Why it matters |
|---|---|---|
| `50110a9` | Caregiver add-medicine form + repeatable loop | The two-role transaction is demonstrable on stage |
| `05babdf`, `3ec2e65` | Android package + EAS preview profile + link | Installable APK pipeline |
| `9fee7ea`, `13049bb` | Read-only database viewer + version bump | The demo can prove its own database |

> Note: the demo polish commits are *demo* work, explicitly not product scope — the
> schema work is the product track.

### Phase E — Security closeout (Sep 27)

| Commit | What | Why it matters |
|---|---|---|
| `e1df57a` | Freeze SC-1…SC-3 corrections and acceptance criteria | Owner decisions become a build contract |
| `7cb835f` | Resolve architect critique in the addendum | Spec is critiqued before implementation |
| `6f34c79` | Security corrections + tests | SC-1, SC-2, SC-3 implemented; 26 → 124 pgTAP |
| `6beb42e` | Fold adversarial/reviewer findings in | Review findings ship as a migration, not a comment |

---

## 3. Learning stations

Each station: **Read → Run → Inspect → Explain back → Rebuild.**

### Station 1 — The rulebook

**Read:** `AGENTS.md`, then `docs/00-product-flow.md` §1–4, `docs/01-dev-environment.md`
§4–6 and §10–11, and skim `docs/02-ui-ux-standard.md` headings.

**Inspect:** count the hard rules; note which of them are *product ethics* (never
suggest a substitute) and which are *engineering* (idempotency at DB level).

**Explain back:**
- Why does the product-flow doc win on product scope and the dev-environment doc win
  on tooling? What happens when they disagree?
- What exactly is in the definition of done?
- Which rules apply to *every* sprint regardless of feature?

**Rebuild:** before writing any code, write your own one-page rulebook: the product
boundary, the data rules, the accessibility rules, and the workflow loop.

### Station 2 — Scaffold and monorepo

**Read:** `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`,
`.github/workflows/ci.yml`, `apps/mobile/`, `packages/shared/`.

**Inspect:**
- Root scripts fan out with `pnpm -r --if-present run …`.
- CI runs typecheck/lint/test for the workspace, and ruff/pytest for `services/ai`.
- `packages/shared` holds types + zod schemas used by the app (`@eldercare/shared`).

**Explain back:**
- Why a monorepo instead of three repos?
- Where do shared types live, and why is that not inside `apps/mobile`?

**Rebuild:** create a pnpm workspace with `apps/*`, `packages/*`, `services/*`, one
shared package with a test, a minimal Expo app, and a CI file that runs the gates.

### Station 3 — Deciding, not drifting (ADRs + UI standard)

**Read:** `docs/02-ui-ux-standard.md` §20.2 (the C-R1…C-R4 conflicts),
`docs/adr/README.md` and all four ADRs, and (skim) the PDF extraction workflow:
`node scripts/pdf-text.mjs docs/<file>.pdf --out <txt>`.

**Inspect:** each ADR records decision, alternatives, and follow-ups. ADR-001 made
"connected family member" a **third role, modelled as care-circle membership** — not a
separate account type with its own data.

**Explain back:**
- Why was the third role modeled as membership instead of a sibling of caregiver/elder?
- Why must the approved PDFs be revised to match, and where is that tracked?
- Why is the extracted `.txt` not trusted as a source?

**Rebuild:** take any two disagreeing documents, list the conflicts, write an ADR with
options A/B and a recommendation, then decide.

### Station 4 — The runnable local demo (SQLite)

**Read:** `DEMO.md`; then, in `apps/mobile/src/`:
`app/` route groups `(auth)`, `(caregiver)`, `(elder)`; `auth/auth-context.tsx`;
`db/database.ts`, `db/users.ts`, `db/doses.ts`, `db/demo.ts`, `db/inspect.ts`;
`packages/shared/src/dose.ts` and `status-presentation.ts`.

**Inspect — the three ideas worth keeping:**
1. **Outcomes as data.** Sign-in returns `{ ok: true, user } | { ok: false, message }`;
   screens render the message instead of guessing.
2. **Derived state at read time.** The stored `status` is never trusted;
   `deriveDoseStatus()` computes `upcoming/due/taken/missed` from timestamps
   (`packages/shared/src/dose.ts`).
3. **Idempotency at the data layer.** `confirmDose()` uses
   `WHERE … AND taken_at IS NULL` — a double tap or retry cannot overwrite the
   timestamp or create a second event.

**Run:** the whole loop from `DEMO.md` twice; then try a double-tap on
**Mark as taken** and open **View database** to see one timestamp, not two.

**Explain back:**
- Why is status derived rather than stored?
- What breaks if the demo were swapped to Supabase, and (crucially) what does *not*
  change? (Answer: `db/users.ts` / `db/doses.ts` internals change; screens don't.)
- Why is the session deliberately in memory?

**Rebuild:** a minimal Expo Router app: `(auth)/sign-in`, `(elder)` home with one
confirm button, `(caregiver)` home listing confirmations, SQLite schema + seed, the
`taken_at IS NULL` guard, and one test for `deriveDoseStatus`.

### Station 5 — Sprint 1: the real product database

**Read first:** `docs/specs/sprint-1.md` (the whole file, including the security
closeout addendum). Then the migrations **in order**, using the header comments:

| # | Migration | Object |
|---|---|---|
| 1 | `20260923144348_bootstrap_extensions.sql` | extensions only (`pgcrypto`, `vector`); explicitly *not* product schema |
| 2 | `20260925120000_sprint1_profiles.sql` | `profiles`; immutability guard; `handle_new_user()` signup trigger |
| 3 | `20260925120100_sprint1_care_links.sql` | `care_links` + one-manager/one-elder unique indexes; `care_link_invites` (hashed codes) |
| 4 | `20260925120200_sprint1_rls_and_rpcs.sql` | append-only `audit_events`; helpers; RLS enable + policies; six RPCs |
| 5 | `20260926190008_sprint1_security_corrections.sql` | SC-1…SC-3 corrections (forward migration) |
| 6 | `20260926191447_sprint1_closeout_review_fixes.sql` | review findings (forward migration) |

**Inspect — map acceptance criteria to tests.** `supabase/tests/`:
`sprint1_accounts_and_care_circle.test.sql` (invariants, idempotent redemption,
default-deny RLS, append-only audit) and `sprint1_security_closeout.test.sql`
(SC-1/2/3). Each assertion is an acceptance criterion in code form. Run
`npx supabase test db` and read a few assertions.

**Explain back:**
- How does default-deny RLS make an unrelated authenticated user read **zero** rows?
- Why is the elder's write path an RPC instead of an INSERT grant?
- Which rule makes the second active manager per elder impossible?
- Why is a redeemed code single-use, and why does a retry return the *same link*?
- What stops UPDATE/DELETE on `audit_events`?

**Rebuild:** from an empty Supabase project, create `profiles` + signup trigger, then
`care_links` + unique indexes, then enable RLS and write policies; as
`authenticated`, prove (in pgTAP or psql) that:
(a) an unrelated user reads zero rows, (b) a direct write fails, (c) a duplicate
active manager insert fails.

### Station 6 — The security closeout (think like an attacker)

**Read:** the closeout addendum in `docs/specs/sprint-1.md`, then the diff
`git show 6f34c79` and `git show 6beb42e`. The addendum is a *build contract*:
exact result shapes, locking, countable-failure rules, malformed-claim handling.

**The three gaps, in one line each:**

- **SC-1 — signup role was optional.** `coalesce(..., 'elder')` silently made a
  missing role an elder account. Fix: fail the signup; no default.
- **SC-2 — sensitive RPCs trusted any valid session.** Fix: a server-side helper
  checks the JWT `amr` claim for a **password** entry no older than 300 s; it fails
  closed on missing/malformed/stale claims. Refreshing a token does **not** renew the
  password timestamp, so a stolen session cannot pass it.
- **SC-3 — a wrong invite code burned someone else's invite.** Fix: invalid attempts
  never modify invite rows; per-account rate limiting
  (5 evaluated failures / 15 min, derived from audit rows); uniform
  `{"status":"invalid"}` for wrong/expired/unknown; replays return the same `link_id`;
  `code_hash` is not selectable by `authenticated`.

**Explain back:**
- Why is "default to elder" a privilege-escalation-shaped bug even though elder has
  *less* power?
- Why doesn't `iat` freshness prove a human re-entered the password?
- Why does a refused (rate-limited) call write no audit row?
- Why did the fix replace the *table-level* SELECT grant instead of adding a
  column-level revoke?

**Rebuild:** for each guarantee in the spec, write the failing test **first** (no
`amr`, stale `amr`, sixth failure → `rate_limited`, replay → same link), watch it
fail, then implement until it passes.

### Station 7 — Gates, reviews, acceptance

**Read:** `docs/01-dev-environment.md` §10 (sprint loop, model routing),
`AGENTS.md` (delivery plan), `docs/specs/README.md`.

**Inspect:** the sprint loop as a checklist — spec → architect critique → branch →
small commits → `pnpm typecheck/lint/test/format:check/check:contrast` →
`npx supabase test db` → `@gemini-reviewer` + `@challenger` → owner explains the diff
→ merge → ADR note → evidence in `docs/thesis/`.

**Explain back:**
- Which reviewer do you summon for RLS/offline-race concerns, and why that one?
- When may `@final-reviewer` be used?
- What evidence goes in `docs/thesis/`, and what may never be fabricated?

**Rebuild:** run the whole gate set on your mini-rebuild and write a five-line
acceptance summary that a non-programmer could understand.

---

## 4. The whole build order, condensed

If you were rebuilding from zero, this is the order that worked here — each step
leaves something verifiable:

1. Write the rulebook (`AGENTS.md`-style) and one product-flow page. **Verify:** a
   stranger can tell what's in and out of scope.
2. Scaffold the workspace: `apps/*`, `packages/*`, `services/*`; strict TS; CI that
   runs typecheck/lint/test. **Verify:** CI is green on an empty change.
3. Define shared contracts first (statuses, roles, schemas) with unit tests.
   **Verify:** tests fail when you break a contract.
4. Build the throwaway demo with synthetic fixtures only. **Verify:** two roles,
   one transaction, idempotent retry, honest limits list.
5. Write the Sprint 1 spec; get it critiqued. Then build the database in this order:
   profiles → care links/invites → RLS + audit + RPCs. Migrations ship with policies
   **and** tests. **Verify:** `db reset` + `test db` green; direct writes fail.
6. Adversarial pass: for every sensitive write, write the attack test first, fix,
   re-run. Forward-migrate; never edit an applied migration.
7. Stop. Cut over the app in its own sprint with its own spec (that's 1b).

---

## 5. Glossary (one-liners)

- **RLS (Row Level Security)** — Postgres feature; every query is filtered by policies
  for the current role. Default deny: no policy means no rows.
- **RPC** — here, a Postgres function called through Supabase; the only write path for
  sensitive actions, so logic and audit live server-side.
- **`security definer`** — function runs with the owner's privileges (to write tables
  the caller cannot); must be written carefully (`search_path`, narrow scope).
- **JWT `amr` claim** — "authentication methods references"; records how the session
  was authenticated, including the password timestamp SC-2 checks.
- **pgTAP** — test framework for Postgres; `supabase test db` runs the `.test.sql`
  files.
- **Forward migration** — a new file that changes an applied schema; applied
  migrations are never edited.
- **Idempotent** — running it twice has the same effect as once (retry-safe).
- **Append-only** — rows can be inserted but never updated or deleted; enforced by a
  trigger.
- **Advisory lock** — Postgres lock you take explicitly; serializes per account
  without locking the whole table.
- **bcrypt** — slow password/code hashing so a leaked table can't be reversed quickly.
- **Outbox** — local queue of offline writes, replayed when online; the design for
  Sprint 1b's SQLite role.
- **Derived state** — status computed from data at read time, never trusted from a
  column.

---

## 6. Where Sprint 1b begins (the boundary)

You stop here on purpose. Current state at the boundary:

- Mobile app: local SQLite demo, two roles, repeatable transaction, **not** connected
  to Supabase.
- Supabase: Sprint 1 schema + closeout corrections, 124/124 pgTAP, awaiting owner
  acceptance at the 2026-10-01 checkpoint.
- Hand-off notes already written in `docs/specs/sprint-1.md` ("Hand-off notes for
  Sprint 1b"):
  - `care_link_invites` no longer grants table-level SELECT — the client must
    enumerate columns; `select('*')` raises `42501`.
  - `redeem_care_link_code` returns HTTP 200 with a `status` field; the three
    sensitive RPCs raise `42501` once the 300 s window passes, so the client
    re-authenticates in-flow via `signInWithPassword`.
  - UX: password prompt at consent/revoke; cooldown countdown from
    `retry_after_seconds`; generic invalid-code message; codes shown once.
- Sprint 1b scope per `docs/01-dev-environment.md` §11 and `AGENTS.md`: cut the app
  over to Supabase Auth + Postgres incrementally (email/password only; SQLite becomes
  cache/outbox only), and add the family-member auth/profile care-circle foundation
  (full family UI stays Sprint 8). Re-verify the `amr` mechanism against the hosted
  project before cutover.

**Next actions once accepted:** owner approves `docs/specs/sprint-1b.md`, `@architect`
critiques it, then the same loop as Station 7 — spec → branch → small commits → gates
→ review → acceptance.

**Branch state (2026-09-29, updated after the critic).** The spec is written and the
Architect critique is folded in. `demo-sqlite-fallback` tags the local demo described
above. Branch `sprint-1b-supabase-cutover` carries the cutover: local identity and demo
modules (`db/users.ts`, `db/demo.ts`) are deleted, the auth context becomes a Supabase
state machine over a chunked SecureStore adapter, care links move to RLS-scoped reads plus
the guarded RPCs, the SQLite viewer entry point is hidden, and the family-member shell
exists. The tag stays for the offline fallback demo.
