# AGENTS.md

## Status

**Scaffolded and running locally; Supabase cutover in progress.** `main` holds the working local-demo mobile build (preserved by the tag `demo-sqlite-fallback`) and the full Sprint 1 schema work. Branch `sprint-1b-supabase-cutover` replaces the local identity/data path with Supabase Auth + Postgres across **three roles** (caregiver, elder, connected family member): RLS-scoped reads, guarded RPCs, chunked-SecureStore sessions, in-app-only dialogs, and a hidden legacy SQLite viewer. The **hosted project is live** (`buwwkdhzansbyeytsufj`, Singapore, Free): **eight** Sprint 1–3 migrations are applied — through Sprint 3's `medications`/`medication_schedules`/`medicine_batches` (pushed 2026-09-30 after the owner's pre-push `db dump`) — hosted Auth has confirm email off and enforces the 6-character minimum (applied from the repo `config.toml` with `supabase config push`, auth group only), and the three synthetic demo accounts are provisioned and role-verified under RLS. **Sprint 4 adds two further migrations locally** (`20261015120000_sprint4_dose_events.sql` and `20261015130000_sprint4_realtime.sql`); they are **not yet pushed to hosted** and await the owner's pre-push `db dump`. Hosted smoke (2026-09-29): each role sees only its own profile row, direct writes to protected tables return `42501`, `create_elder_link_invite` returns a six-digit code, and a fresh password grant passes the `amr` re-auth guard while the same token 310 seconds later is rejected with `42501` "re-authentication required". Hosted smoke of the Sprint 3 tables (2026-09-30): signed-out reads and a direct `insert` into `medications` both return `42501`, a signed-in caregiver's RLS reads return `200`, and `create_medication` on an unowned elder returns `42501` "only the linked manager can change this medication plan" (the function is exposed and its authorization guard fires). Still owner-gated before the acceptance run: keep-alive repo secrets + manual dispatch, EAS env vars, and the preview APK install — see `docs/specs/sprint-1b.md`. `services/ai/` is still a contract only — `/health` is real, `/ocr` and `/embed/text` return `501`. `packages/shared/` holds the zod schemas, the chunked session storage and the status-presentation contract. The current Android demo package/version is documented in `apps/mobile/app.json` and `DEMO.md`.

**Verified green:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (**104** passing on the cutover branch; 22 on `main`), `pnpm format:check`, and `pnpm check:contrast` (both themes, both card-gradient stops). Live local Supabase tests pass: `npx supabase test db` — **381/381** pgTAP assertions (Sprint 1 = 124, Sprint 2 = 60, Sprint 3 = 96, Sprint 4 = 101).

**Current architecture boundary:** on the cutover branch the app is **Supabase-backed** — identity, roles, care links, consent, revoke, the elder/emergency profile, medication/inventory setup and now the **dose-confirmation loop** run against the project (local Docker stack for development; the Sprint 4 tables are local-only until the push), and the legacy SQLite store is unreachable for any medical write — it survives only as the Sprint 4 confirmation outbox and the tagged demo viewer. On `main` the build is still the **local-database demo** until the branch merges. Sprint 1 acceptance is the next owner decision; Sprint 2, Sprint 3 and Sprint 4 are implemented and their specs are approved. Appointments remain an empty state. Do not start another feature sprint without its approved spec and an explicit owner request (`docs/specs/README.md`).

**Scope baseline resolved (2026-09-25).** The four conflicts between the approved design PDFs and
`docs/00-product-flow.md` (`docs/02-ui-ux-standard.md` §20.2, C-R1…C-R4) are decided: the
product-flow scope wins, and "Connected Family Member" is a **third role**, modelled as care-circle
membership. See `docs/adr/adr-001`…`adr-004`, all now **Accepted**. Consequence: the approved
system documentation and wireframes must be revised to match, and the third role's screens land in
the dedicated family sprint (`docs/01-dev-environment.md` §11).

## Required reading before any work

1. `docs/00-product-flow.md` — product source of truth (roles, screens, flows, data model, hard rules). **Wins on product scope.**
2. `docs/01-dev-environment.md` — tooling source of truth (stack, services, workflow, model roster). **Wins on tooling.**
3. `docs/02-ui-ux-standard.md` — UI/UX source of truth (tokens, status presentation, accessibility, copy rules). **Wins on UI/UX.** Required before touching anything under `apps/mobile/src/`.
4. `docs/UI_theme_palette.pptx.pdf` — the owner's visual standard (palette, logo, icon set, button variants). **Wins on visual identity**, and the app must work in **both light and dark mode** (owner instruction 2026-09-29). Its fonts are subset-encoded, so read it as images with `node scripts/pdf-text.mjs` + the page JPEGs, not from extracted text.

These are long and full of **decided** choices (do not silently swap tools, services, or models). Read all four in full before feature or setup work. The summary below is not a substitute.

The two approved design PDFs (`docs/ElderCare_Plus_System_Documentation_and_User_Manual_v1.0.pdf`, `docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf`) are also authoritative on screens and visual identity. Read them with the checked-in, dependency-free extractor — `node scripts/pdf-text.mjs <pdf> --out <txt>` — and trust the PDF, not the extracted `.txt` (regenerate it rather than treating it as a source). `docs/02-ui-ux-standard.md` §5 and §20 digest them and record where they disagree with `00-product-flow.md`.

## Hard rules — violating these is a bug

- Never suggest a substitute medicine, change a dose, or tell the elder to stop treatment. Unclear/expired/conflicting medicine info routes to the caregiver or a qualified professional, never an AI-generated answer.
- Never hard-delete medical history — deactivate or archive with timestamps. Confirmed doses, stock adjustments, prescription verifications, and past appointment states require confirmation and produce an `audit_events` row.
- **Idempotency is a hard requirement, not an optimization.** Dose confirmation, missed-dose transition, and inventory decrement must be enforced at the DB level (one `dose_events` row per schedule occurrence). An offline retry must never duplicate a `taken_at` timestamp or double-decrement stock.
- RLS on every table, default deny. Elder can write only their own due dose, through a guarded RPC — never a direct table write. Service-role key is server-only.
- Elder-submitted prescription evidence stays `pending_review` until the caregiver verifies it.
- OCR/AI output is reference-only. It never auto-creates or auto-fills a medicine, schedule, dose, or clinical advice; the caregiver reviews and enters every field.
- Never convey status (stock/expiry) by color alone; use text/icons. Mind accessibility: 48 dp touch targets (56 dp for `Mark as taken`).
- Consent, unlink, account deletion, and evidence-access changes require re-authentication.
- Lock-screen notification text stays minimal; full medical detail only after authenticated in-app navigation.

## Data safety and AI use (non-negotiable)

- **Synthetic elder/caregiver fixtures only** — in dev, tests, and anything sent to an AI tool. Never send real health data (names, conditions, allergies, medications, prescription photos) to any AI model or free tier.
- Never ask for, print, store, or commit secrets (API keys, service-role key, tokens).
- **Budget is tight.** No paid service, plan, dependency, or upgrade without stating the cost and getting owner approval. Free tiers first.
- Never fabricate citations, benchmark numbers, survey results, test results, metrics, or quotes.

## Conventions

- pnpm; TypeScript strict. Layout: `apps/mobile/` (Expo Router; `(auth)`, `(caregiver)`, `(elder)` route groups), `services/ai/` (FastAPI OCR + text embeddings), `packages/shared/`, `supabase/`, `docs/`. Mobile-only — no web client, no admin role.
- All schema changes go through migration files; never edit an applied migration or hand-change the production schema.
- Env vars live in git-ignored `.env*`; only public values may use the `EXPO_PUBLIC_` prefix.
- One feature per branch: `sprint-N-short-name`.
- Main coder is DeepSeek V4 Flash. The specialists (`@architect`, `@gemini-reviewer`, `@challenger`, `@final-reviewer`) are **manual, analyze-only** subagents (edit/bash denied) defined in `opencode.json`.
- **Ask the owner for approval before invoking any subagent/agent** (the specialists above, plus `explore`/`general`). Do not spawn one unprompted, even for analysis. (Owner instruction 2026-09-29.)
- **UI visual standard:** `docs/UI_theme_palette.pptx.pdf` is authoritative for palette, logo, icon set and buttons. Style new UI with its tokens, **light and dark mode compatible**, and keep the accessibility rules in `docs/02-ui-ux-standard.md` (§5 contrast, 48/56 dp targets, never colour alone). Validate token changes with `pnpm check:contrast`. (Owner instruction 2026-09-29.)
- When a tooling decision changes, update `docs/01-dev-environment.md` and add a line to its changelog (§16).

## Workflow

Spec first: owner writes `docs/specs/sprint-N.md` → `@architect` critiques it → branch → implement in small chunks → typecheck/lint/tests → review (`@gemini-reviewer`, and `@challenger` for anything touching the confirmation loop, offline sync, or RLS) → owner must be able to explain the diff before merge.

**Definition of done:** meets the spec's acceptance criteria, passes typecheck/lint/tests, respects the hard rules above, ships any migration and its RLS policy together, and comes with a plain-English summary.

## Delivery plan — owner checkpoint Thursdays

**Planning horizon:** 2026-09-27 through **Thursday 2026-10-22**, with a major checkpoint every Thursday evening. This is a compressed delivery plan, not a promise that each official sprint receives a full sprint cycle. The official dependency map remains in `docs/01-dev-environment.md` §11; each new feature still requires its own approved spec.

| Checkpoint | Milestone | Required outcome |
|---|---|---|
| Thu **Oct 1** | Sprint 1 accepted; Sprint 1b started | 26/26 DB tests green; Supabase cutover spec approved; Auth/client foundation ready |
| Thu **Oct 8** | Sprint 1b + Sprint 2 | Supabase-backed login/linking; caregiver, elder and family roles represented; elder profile and emergency contacts usable |
| Thu **Oct 15** | Sprint 3 + Sprint 4 MVP | Medication plans, schedules, due-dose confirmation, offline pending/retry behavior, missed doses, and DB-level idempotency demonstrable |
| Thu **Oct 22** | Safety/integration release | Inventory/expiry safety, prescription evidence review, basic appointments, final security/idempotency checks, evidence, and APK/demo build |

**Scope priority if time compresses:** Supabase Auth/RLS → care linking → elder/emergency profile → medication adherence → inventory/expiry → prescription evidence → appointments → family UI → reports/retrieval. Family UI, advanced reports/embeddings, and nonessential appointment polish are stretch items for the final checkpoint.

**Weekly rhythm:** finalize/specify Friday–Saturday; architecture and implementation Sunday–Wednesday; stop new scope Wednesday evening; test, review, document, and accept Thursday. October 15 is the critical core-product checkpoint: the medication confirmation loop must be secure, repeatable, and demonstrable by then.

## Current execution decisions — confirmed 2026-09-27

- **Sprint 1 security correction:** signup role is mandatory. Missing or unknown roles fail; never default a missing role to `elder`.
- **Re-authentication:** consent, unlink/revoke, account deactivation, and evidence-access changes must be enforced by a server-verifiable recent-authentication state. A client boolean is never sufficient. Confirm the concrete Supabase Auth mechanism during Sprint 1 review.
- **Invite-code abuse protection:** invalid attempts must not burn another user's invite. Keep six-digit codes, require an authenticated redeemer, rate-limit by redeemer/session with cooldowns, avoid existence/expiry leakage, never store plaintext codes, and audit failed attempts.
- **Mobile cutover:** use the incremental approach for Sprint 1b. Supabase is authoritative for identity, roles, care links, confirmed doses, inventory changes, and audit events. SQLite may remain only as cache/outbox storage for offline behavior.
- **Authentication:** Sprint 1b uses email/password only. Existing dummy accounts may be used for local/phone testing, but credentials remain synthetic, local/ignored, and are never committed or sent to AI tools.
- **Demo scope:** the class-checking demo and database viewer are no longer constraints on the production cutover plan; do not expand them during Sprint 1b. *(Superseded in part 2026-09-29: the checking needs the demo build and a minimal family view — see below.)*
- **Family role:** add the family-member authentication/profile/care-circle foundation in Sprint 1b; defer the complete read-only family UI, help requests, and availability to Sprint 8.

## Class-checking decisions — confirmed 2026-09-29

The instructor's 3rd-increment checking (one complete transaction cycle, database expansion, in-app messages only) is **2026-10-15/16** — the same week as the Oct 15 delivery checkpoint. Owner decisions:

- **The checking demos the Supabase-backed app as an installed preview APK** on the owner's phone, running against the **hosted** Supabase project. No Docker or local stack at the venue.
- **The family-member read-only view appears in the checking demo.** A deliberate exception to the Sprint 8 deferral: the family foundation stays in Sprint 1b; the minimal adherence view lands with Sprint 4.
- **The medication transaction cycle is the deliverable of record:** caregiver sets up medicine + schedule + batch → a due dose reaches the elder → the elder confirms once (idempotent) → the database records the taken event, decrements stock, writes inventory, audit and notification rows → the caregiver receives the confirmation in-app. The "do not expand the demo" line above is superseded to the extent the checking requires it.
- **Hosted project is critical path:** create it, push migrations, confirm email off, set keep-alive and EAS environment values, create synthetic demo accounts, and take a backup before the checking.

### This week's Sprint 1 closeout — checkpoint Thu 2026-10-01

This week is **Sprint 1 security closeout plus Sprint 1b planning**, not medication, appointments, OCR, reports, or APK work.

1. **Sun Sep 27:** freeze the three security corrections and acceptance criteria.
2. **Mon Sep 28:** confirm the Supabase re-authentication mechanism and invite-code rate-limit design.
3. **Tue Sep 29:** implement the corrections and regression tests.
4. **Wed Sep 30:** run typecheck/lint/tests, review RLS/RPC behavior, and perform adversarial security review. Stop new scope Wednesday evening.
5. **Thu Oct 1:** review the diff, demonstrate the flows, accept or reject Sprint 1, and approve the Sprint 1b specification.

Sprint 1 is done only when the existing tests still pass, new tests cover all three corrections, sensitive writes remain RPC/RLS guarded, and the owner has a plain-English acceptance summary. The old **26/26** result is the baseline; after adding tests, report the new total. If the re-auth mechanism is blocked by a verified Supabase limitation, document the blocker explicitly rather than claiming it is enforced.

## Useful commands

```bash
pnpm install
pnpm --filter mobile start                  # Expo dev server
npx supabase start                          # local stack (Docker)
npx supabase migration new <name>
npx supabase db push
cd services/ai && uv run uvicorn main:app --reload
eas build -p android --profile preview      # installable APK (counts against free quota)
```

Expo Go for daily work; the EAS free quota is small (15 Android + 15 iOS builds/month), so batch native changes. The Supabase Free project pauses after ~a week idle and has no downloadable backups — run `npx supabase db dump -f backup.sql` before the defense.
