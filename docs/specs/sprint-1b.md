# Sprint 1b — Cut the mobile app over to Supabase Auth + Postgres (identity, roles, care circle)

- **Status:** **Approved by the owner 2026-10-01** (`docs/specs/checkpoint-2026-10-01.md`). Drafted
  2026-09-29 at the owner's request after the 2026-09-29 decision that the 2026-10-15/16 class
  checking demonstrates the Supabase-backed app. Revised the same day to fold in the `@architect`
  critique: the transitional SQLite strategy, the session-storage and auth state-machine contracts,
  the hosted evidence checklist, the synthetic setup runbook and the sequencing gates are now part
  of the build contract. Implemented on `sprint-1b-supabase-cutover` and merged to `main` via PR #1;
  hosted verification evidence appended 2026-09-29.
- **Branch:** `sprint-1b-supabase-cutover`.
- **Flow:** `docs/00-product-flow.md` Flow A (first use and care linking); `docs/adr/adr-001`
  (third role, care-circle membership).
- **Depends on:** Sprint 1 accepted at the 2026-10-01 checkpoint (schema, RLS, RPCs, 124/124
  pgTAP).

## Goal

Make Supabase the authoritative store for **identity, roles and the care circle** in the mobile
app, and prove it on the **hosted** project so the checking release can run from an installed APK
on a phone. The visible result: sign-up with a mandatory role, sign-in with sessions that survive
a cold start, the real invite-code linking flows (caregiver → elder; caregiver → family member →
elder consent), revoke and deactivate behind a password prompt, and a minimal `(family)` shell
backed by real data. SQLite stops being the identity/data source and becomes only the future
offline outbox (Sprint 4).

No new database tables this sprint: the schema is Sprint 1's, already shipped and tested. This
sprint is the client cutover and the hosted-project proof.

## Cutover strategy (the transitional SQLite question)

The architect identified the real risk: cutting identity over without breaking what exists, and
without leaving a second working identity path behind. The strategy is explicit:

1. **Removed from all reachable paths in this sprint:** local sign-in/sign-up, local password
   hashes, local user creation, local care linking, and demo account/seeding (`db/demo.ts`,
   `db/users.ts` are deleted; `db/care-links.ts` becomes Supabase-backed).
2. **Kept temporarily, clearly marked legacy, unreachable for writes:** the SQLite dose modules
   (`db/doses.ts`, `db/database.ts`, `db/inspect.ts`) and the on-device database viewer screen.
   The caregiver "View database" entry point is hidden; the files stay until Sprint 4 replaces
   the viewer with the in-app activity/audit screen. Medication screens may keep reading the
   (empty) legacy tables and therefore show their normal honest empty states; no demo data is
   inserted anywhere.
3. **Write paths disabled:** the caregiver "Add a medicine" form (a legacy SQLite write) is
   removed from the 1b build; it returns in Sprint 3 against Supabase. Nothing local can create
   or change medication data in 1b.
4. **Fallback preserved:** before the branch is created, the current main state is tagged
   `demo-sqlite-fallback`, and the existing local-demo APK stays installable. If Sprints 3–4
   cannot reach the checking, the tagged build is the fallback demo — not a reason to keep two
   identity systems alive in the product code.
5. **Deletion of the legacy modules and viewer is deferred** to the Sprint 4 cleanup, when their
   Supabase replacements exist. Removing them in 1b would destroy the fallback for no benefit.

## Owner prerequisites (critical path — before implementation work)

1. **Create the hosted Supabase project** `eldercare-plus` (Singapore region, Free plan; the
   account limit is two active projects). Owner account action; nothing in this repo can do it.
2. Link and push: `npx supabase login`, `npx supabase link --project-ref <ref>`,
   `npx supabase db push`; confirm all six migrations applied.
3. Hosted Auth settings: **Confirm email OFF** (the demo accounts sign in immediately), minimum
   password length 6. No SMTP.
4. Repository secrets for the existing keep-alive workflow: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   (`.github/workflows/supabase-keepalive.yml`).
5. EAS environment variables for the preview build: `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Only public client values; the **service-role key never goes
   into the app, the repo or an EAS variable**. Local development uses the git-ignored
   `apps/mobile/.env`.
6. Provision the three synthetic demo accounts and their circle using the runbook below.
7. Verify the SC-2 `amr` mechanism on the hosted project (acceptance criterion 7) before any
   sensitive RPC is wired.

## Hosted release checklist (evidence for the checkpoint)

- [ ] Hosted project ref recorded (not a secret) and `npx supabase migration list --linked`
      shows all six migrations.
- [ ] Auth settings verified on hosted: confirm email off, minimum password length 6.
- [ ] Synthetic accounts provisioned via the runbook; every step's expected status observed.
- [ ] Hosted RLS smoke test with two unrelated accounts: no care-circle rows visible; a direct
      write to a protected table is rejected; each guarded RPC's result verified.
- [ ] The installed app is provably pointed at hosted: no `localhost`/`10.0.2.2` URL remains;
      the build's `EXPO_PUBLIC_SUPABASE_URL` host is the hosted project.
- [ ] Keep-alive workflow dispatched manually once and recorded as successful.
- [ ] Backup (`npx supabase db dump -f <path>`) created **outside the repository**, non-empty,
      date + project ref recorded; `git status` shows no dump file.
- [ ] Preview APK installed on the owner's phone; sign-in as each of the three roles recorded.

### Hosted evidence — 2026-09-29, project `buwwkdhzansbyeytsufj`

Measured against hosted with only public client values and the three synthetic accounts. Covers
checklist items 1–2 and the account/RLS parts of 3–4; items 5–8 stay owner actions.

- **Item 1** — `npx supabase migration list --linked`: all six migrations applied.
- **Item 2** — hosted Auth has confirm email off (`mailer_autoconfirm: true`) and a 5-character
  sign-up probe fails `422 weak_password` ("at least 6 characters"), applied from
  `supabase/config.toml` with `npx supabase config push` (auth group only).
- **Item 3 (accounts)** — `node scripts/provision-demo-accounts.mjs` signs in each role and reads
  its own `profiles` row; credentials live in the git-ignored `apps/mobile/.env.demo-accounts`.
- **Item 4 (partial)** — each role sees exactly one profile row (its own) and `care_links` is
  empty while unlinked; a direct `care_links` insert and a `profiles.role` update are rejected
  with `42501`; `create_elder_link_invite` returns a six-digit code. The remaining guarded RPCs
  are covered by the runbook below.
- **Acceptance criterion 7** — `amr`: a fresh password grant passes `assert_recent_password_auth`
  (a bogus link id then fails `P0002`), and the same token 310 s later is rejected `42501`
  "re-authentication required".
- **Leave-behind** — one unconsumed elder invite for the demo caregiver, expiring
  `2026-09-30 08:32Z`; the first runbook invite supersedes it.

## Synthetic demo setup runbook (hosted, repeatable)

Credentials are synthetic, stored locally (password manager), never committed. Exact order, with
the expected result at each step:

| # | Actor | Action | Expected |
|---|---|---|---|
| 1 | caregiver | Sign up (role `caregiver`) | Session starts; dashboard shows "no elder linked" |
| 2 | caregiver | Link an elder → generate code | Six-digit code shown once, 24 h expiry |
| 3 | elder | Sign up (role `elder`), enter the code | `{"status":"active"}` → link active on both apps |
| 4 | caregiver | Invite family member by email | Code shown once; invite is email-bound |
| 5 | family member | Sign up with that email, enter the code | `{"status":"invited"}` → "waiting for elder consent" |
| 6 | elder | Review the link, enter password, consent | Link becomes active; family shell opens |
| 7 | family member | Open family home | Linked elder visible, read-only, no management controls |
| 8 | elder | Revoke the family link (password) | Family shell shows revoked/empty; history kept |

Recovery: a mis-consumed invite is never edited; revoke the wrong link and issue a new invite (the
RPC expires any still-open invite for that circle). If an account is wrong, deactivate it and
re-run the runbook with fresh synthetic addresses.

## User stories

1. As a new user I sign up with email, password and one of three roles; a missing or unknown role
   fails and no account is created (SC-1, server-enforced). There is no default role.
2. As a returning user I sign in and my session survives an app restart; I am routed by the role
   stored in `profiles`, never by anything the client asserts.
3. As a caregiver with no linked elder I generate a six-digit code, see it once with its expiry,
   and my app shows the link once the elder redeems it.
4. As an elder I enter the caregiver's code; a wrong or expired code gives one generic message; a
   cooldown shows a countdown from `retry_after_seconds`; a correct code activates the link.
5. As a caregiver I invite a family member by email; as the elder I approve the link by entering
   my password before that member gets read-only access; as the elder I can revoke the link (also
   behind the password prompt).
6. As any user I can sign out; deactivating my account requires the password prompt and a
   confirmation, keeps history (soft delete) and revokes my links.
7. As a family member I sign in and land on the `(family)` shell, which shows the elder I can view
   and that my access is read-only. The adherence cards land in Sprint 4 (checking requirement).

## Client contracts (build contract)

### 1. Session storage — chunked SecureStore adapter

`expo-secure-store` rejects values over roughly 2 KB and a Supabase session can exceed that. The
adapter is a pure factory in `packages/shared` (unit-testable) that takes a
`{ getItem, setItem, deleteItem }` backend and implements Supabase's `SupportedStorage`:

- Keys: `<prefix><key>.manifest` and `<prefix><key>.<generation>.<n>`; chunk payload ≤ 1800
  characters, at most 8 chunks; the manifest `{"version":1,"generation":g,"chunks":n}` is written
  **last** (commit point).
- `setItem` writes the new generation's chunks, commits the manifest, then deletes the previous
  generation's chunks. Because the generation changes on every write, an interrupted write can
  never overwrite the committed generation: the previous value stays readable.
- `getItem` returns null when the manifest is missing; a malformed, unknown-version or incomplete
  manifest (any chunk missing) is treated as corrupt: the manifest and its chunks are removed and
  null is returned (fail closed, no half-session).
- `removeItem` deletes the manifest and its committed chunks. A value over the configured maximum
  is refused with a clear error instead of growing without bound.
- Tests (Vitest, in `packages/shared` with an in-memory backend): small and oversized round-trip;
  overwrite shrinking; corruption; a missing chunk; interrupted write leaves the previous session
  readable; remove cleans everything. Verified on Expo Go and the preview APK, not only in tests.

### 2. Auth state machine and routing

Atomic states, resolved before anything renders:

`initializing` → `signed_out` | `authenticated` | `error`

- Bootstrap: one Supabase client singleton (module-level), register the `onAuthStateChange`
  listener, then restore via `getSession()`. Events are handled as flags only — no long async
  work inside the callback; the provider serializes profile loads and ignores stale results.
- `SIGNED_IN` / `TOKEN_REFRESHED`: ensure the authoritative profile is loaded once per user.
  `SIGNED_OUT`: clear profile and user. `USER_UPDATED`: refresh the profile row.
- The authoritative profile is `select id, role, full_name, deactivated_at from profiles where id
  = <session.user.id>` (own row under RLS). Routing uses that role, validated against the shared
  schema; auth metadata is only ever used to **submit** the sign-up role, never to route.
- Fail closed on bad identity: missing profile, unknown role or `deactivated_at` set → sign out
  and show an in-app message. A transient fetch error keeps the session and shows a retryable
  startup error instead of signing the user out. No protected screen renders on partial state.
- Role → route map: `caregiver → /caregiver`, `elder → /elder`, `family_member → /family`. Each
  group layout independently guards its role and redirects the other two, so a stale navigation
  state cannot open the wrong shell.
- AppState: `supabase.auth.startAutoRefresh()` on foreground, `stopAutoRefresh()` on background
  (React Native guidance), with `autoRefreshToken: true`, `persistSession: true`,
  `detectSessionInUrl: false`.

### 3. Sensitive-action flow (consent, revoke, deactivate)

`confirm intent → password prompt (in-app field, current email shown read-only) →
signInWithPassword(email, password) → immediately call the RPC → map result → clear the field`.

- No client boolean or parameter is ever sent to assert re-authentication.
- `42501` / "re-authentication required" → "Please enter your password again." Other errors →
  a generic in-app message. The password is never logged or stored after the call.
- If re-auth succeeds but the RPC response is lost, retry is safe: consent, revoke and deactivate
  are idempotent server-side. The app reloads state instead of assuming failure.
- Wrong password, stale `amr`, network failure after re-auth, unauthorized actor and
  already-satisfied operations all have defined in-app messages.

### 4. Invite projection

`care_link_invites` allows only named columns (`code_hash` and `consumed_link_id` are not
selectable; `select('*')` raises `42501`). The client uses one typed constant only:

`id, created_by, elder_id, grants_member_role, invitee_email, expires_at, consumed_at,
consumed_by, created_at`

No generic row helpers or default `select()` on this table; a code-review check enforces it.
`invitee_email` is only shown to the elder as the invited person's display name when needed, never
echoed in errors or logs.

### 5. Error and offline behaviour

- Sprint 1b has **no offline queue** for identity or linking; every action requires connectivity
  and shows a retryable in-app banner on failure. Only medication confirmation gets offline
  treatment, in Sprint 4.
- RPC calls carry a timeout (15 s) and a visible retry; buttons are disabled while an action is
  in flight so a double tap cannot fire twice.
- No `Alert.alert`, `window.alert` or system dialog carries a notification or result message;
  everything renders in-app (existing banner/modal components).

### 6. Shared role contract

`packages/shared/src/role.ts` gains `family_member` (label "Connected family member"), and the
route tree gains the `(family)` group. Stale two-role text in `docs/01-dev-environment.md` (§5)
and any comments is corrected in the same sprint.

## Acceptance criteria

1. **Hosted proof.** The hosted release checklist above is fully checked, with its evidence. The
   app's sign-up, sign-in, linking, consent and revoke work from the phone against hosted.
2. **Sign-up.** The client always submits `role` and `full_name` metadata; the app cannot submit a
   blank role; a crafted request with a missing/unknown role fails server-side (SC-1 tests).
   Three roles are offered; the shared schema carries `family_member`.
3. **Sign-in messages.** Field validation keeps its current wording. Unknown email and wrong
   password deliberately collapse to one message ("Incorrect email or password…") — Supabase Auth
   cannot distinguish them without leaking account existence; this supersedes the local build's
   separate "Account does not exist" message. All messages are in-app.
4. **Session.** A cold start with a valid session lands on the role's home without re-typing the
   password; the state machine above drives sign-out and refresh; signing out clears stored
   session data; a corrupted stored session resolves to signed-out, never a half-state.
5. **Linking.** The caregiver sees the code exactly once with its 24-hour expiry; the elder's
   redemption handles `active`, `invalid` and `rate_limited` as distinct in-app states with the
   cooldown countdown; an idempotent replay returns the same link; the family invite is
   email-bound and stays `invited` until the elder consents; a revoked replay reports `revoked`.
6. **Sensitive actions.** Consent, revoke and deactivate follow contract 3 exactly; a stale
   session (no password entry in the last 300 s) is rejected, the app re-prompts, and no
   privileged effect happens before a fresh password entry.
7. **Hosted `amr` verification.** The 2026-09-27 local probe is repeated against hosted and its
   output recorded: password sign-in carries a `password` `amr` timestamp; refresh does not renew
   it; older than 300 s fails. If hosted differs, **stop and report** rather than weaken SC-2.
8. **RLS stays the boundary.** Two unrelated accounts see zero rows of each other's care-circle
   data; the client never writes `profiles`/`care_links`/`care_link_invites` directly; every
   guarded write goes through the Sprint 1 RPCs; direct writes are rejected in the hosted smoke
   test.
9. **Transitional state.** Readable clinical/demo modules are clearly marked legacy; no reachable
   path authenticates locally, stores password hashes, links a circle locally, or writes
   medication data; the database viewer entry point is hidden; the tagged fallback exists.
10. **Family shell.** An active, consented family member sees the linked elder's display data and
    an explicit read-only label, backed by RLS-scoped queries; an unlinked family member sees an
    empty state; a revoked link shows as revoked/empty; no management control is reachable; and
    negative checks prove the family role cannot call caregiver/elder management RPCs.
11. **Config discipline.** Only `EXPO_PUBLIC_` values reach the app; `.env` files stay git-ignored;
    no secret is committed, printed or sent to a model; backup dumps never enter the repo.
12. **Docs consistency.** The shared role enum, sign-up role cards, route tree, route guards, the
    dev-environment architecture text and comments no longer describe a two-role product.
13. **Gates.** `pnpm typecheck`, `pnpm lint`, `pnpm test` (including the new storage tests),
    `pnpm format:check` and `pnpm check:contrast` stay green; `npx supabase test db` stays at
    124/124.
14. **APK.** One preview APK is built and installed on the owner's phone as the pipeline proof
    **only if quota allows** (confirm remaining EAS builds first; target ≤ 2 Android builds before
    the checking). The final checking build happens after Sprint 4.

## Screens

| Screen | Group | Notes |
|---|---|---|
| Welcome, Sign up, Sign in | `(auth)` | Sign-up gains the third role; messages per contract 3 |
| Link an elder (generate code, status, invite family, revoke) | `(caregiver)` | Reachable from the dashboard empty state and Profile; code shown once |
| Enter a code / Review a link / Consent | `(elder)` | Generic invalid message, cooldown countdown, password prompt for consent/revoke |
| Family home | `(family)` | Linked elder display data + "read-only" label; empty and revoked states; adherence cards in Sprint 4 |
| Profile | all three | Sign out (existing confirmation); Deactivate account (password + confirmation) |

Exact route files are confirmed during implementation; the `(family)` group is new and the
`(caregiver)`/`(elder)` groups gain non-tab link screens.

## Data touched

| Object | Access |
|---|---|
| `profiles` | read own row (role, full_name, deactivated_at); read circle members' display data through the care-link policies |
| `care_links` | read own rows; all writes through RPCs |
| `care_link_invites` | named metadata columns only (contract 4) |
| `audit_events` | read own actor rows only |
| RPCs | `create_elder_link_invite`, `invite_family_member`, `redeem_care_link_code` (jsonb statuses), `consent_to_care_link`, `revoke_care_link`, `deactivate_account` |
| `packages/shared` | `role.ts` gains `family_member`; new chunked-storage module + tests |
| `expo-sqlite` | legacy only, unreachable for writes; remains a dependency for the Sprint 4 outbox |

No migrations and no new tables in this sprint.

## Out of scope

- Medications, schedules, batches, dose events, inventory, notifications — Sprint 3/4.
- The family member's adherence cards (Sprint 4), help requests, availability (Sprint 8).
- Elder profile and emergency numbers (Sprint 2).
- Email delivery, password reset (no SMTP), realtime subscriptions (refresh on focus).
- Deleting the legacy SQLite modules and the database viewer; that cleanup happens in Sprint 4
  when their replacements exist.
- Rewriting `DEMO.md`: the checking demo script is rewritten once Sprint 4 makes the medication
  cycle real.

## Test plan

- `npx supabase test db` — 124/124 stays green; no new pgTAP needed for behaviour the tests
  already pin.
- New Vitest coverage in `packages/shared`: the chunked-storage contract (contract 1) and the
  extended role schema.
- Manual device checklist (recorded as checkpoint evidence): sign up all three roles; cold-start
  session restore; corrupt stored session resolves to signed-out; sign-in failure message; code
  generation + expiry; wrong code; six wrong codes → cooldown countdown; correct redemption;
  family invite + elder consent with password; revoke with password; deactivate with password;
  unrelated account sees nothing; family shell empty/active/revoked states.
- Hosted release checklist and the synthetic runbook above.
- Gates from criterion 13.

## Risks

- **Hosted `amr` behaviour** is verified locally only. Criterion 7 runs before the sensitive RPCs
  are wired; if it differs, stop and report.
- **Chunked SecureStore** is new code; contract 1's tests and the device checks cover it. If it
  proves unworkable in Expo Go, the fallback is `@react-native-async-storage/async-storage`
  (standard Supabase choice, tokens unencrypted) — **owner note required** before adding it.
- **The working local medication loop disappears** between 1b and Sprint 4. Mitigation: the
  `demo-sqlite-fallback` tag and the existing APK; medication screens show honest empty states.
- **EAS quota.** Confirm remaining builds; prefer Expo Go until the integrated Sprint 4 build.
- **Free project pauses / no backups.** Keep-alive workflow + dump after setup and before the
  checking, stored outside the repo.
- **Venue connectivity.** The checking demo needs internet on the phone; rehearse in the lab and
  keep a mobile-data hotspot fallback ready.
- **Scope.** 1b is large; the sequencing gates below keep the medication critical path honest.

## Sequencing gates

- **Gate A — before merging 1b:** hosted checklist complete; three route groups work against
  hosted; linking flows work on Expo Go; legacy local identity unreachable.
- **Gate B — before any legacy module is hidden or removed:** `demo-sqlite-fallback` tag exists
  and the old APK is still installable.
- **Gate C — before Sprint 3 coding starts:** the medication tables/RPC/query contracts for
  Sprint 3 and the confirmation transaction for Sprint 4 are written and critiqued.
- **Gate D — before the final EAS build:** the full dose cycle works in Expo Go against hosted.
- **Final APK:** built after Sprint 4 acceptance, no later than 2026-10-14.

## Hand-off notes for Sprint 2/3/4

- All domain reads are RLS-scoped; follow the Sprint 1 hand-off (named columns on
  `care_link_invites`, no `select('*')`; sensitive RPCs need a fresh password sign-in first).
- Sprint 4 must land the checking requirements on top of 1b: medication plan + schedule + batch,
  generated `dose_events`, the guarded confirmation RPC (one `taken_at`, idempotent), inventory
  decrement + `inventory_transactions`, `audit_events`, notifications, the family adherence
  cards, and an in-app activity/audit screen that replaces the retired local database viewer.
- The family shell from 1b is the mount point for the Sprint 4 adherence cards; keep its route
  and guard stable.

## Checking-release context

The instructor's 3rd-increment checking (2026-10-15/16) requires one complete transaction cycle,
database expansion and in-app messages only. Sprint 1b supplies identity, roles, linking and the
hosted project; Sprints 3–4 supply the medication cycle itself. The delivery plan in `AGENTS.md`
(2026-09-29 decisions) carries the dates.
