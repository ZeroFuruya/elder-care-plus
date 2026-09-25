# AGENTS.md

## Status

**Scaffolded and running locally.** `main` is at `db675f7`, pushed to the private GitHub repo `ZeroFuruya/elder-care-plus`. `apps/mobile/` is no longer a skeleton: it is a working two-role app backed by a local **`expo-sqlite`** database with seeded synthetic fixtures, local auth, and real screens for both roles (see `DEMO.md` for how to run it and the demo accounts). `services/ai/` is still a contract only — `/health` is real, `/ocr` and `/embed/text` return `501`. `packages/shared/` holds the zod schemas and the status-presentation contract. `supabase/` holds config plus the bootstrap extension migration and **no product schema**.

**Verified green on 2026-09-24:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (22 passing), `pnpm format:check`, `pnpm check:contrast`.

**Not built yet:** no Supabase product schema, no Supabase Auth, no RLS, and no appointments (the Calendar tabs show a deliberate empty state). The mobile build is a **local-database demo**, not the RLS-backed design — moving to Supabase means replacing `apps/mobile/src/db/users.ts` and `db/doses.ts` and adding RLS; the screens do not change. Docker Desktop is installed and the local Supabase stack runs; Sprint 1 (accounts, care circle, RLS) is in progress under `docs/specs/sprint-1.md`. Do not start any other sprint without its approved spec and an explicit owner request (`docs/specs/README.md`).

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

These are long and full of **decided** choices (do not silently swap tools, services, or models). Read all three in full before feature or setup work. The summary below is not a substitute.

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
- Main coder is DeepSeek V4.1 Flash. The specialists (`@architect`, `@gemini-reviewer`, `@challenger`, `@final-reviewer`) are **manual, analyze-only** subagents (edit/bash denied) defined in `opencode.json` — which does not exist yet, so they will not resolve until it is created from `docs/01-dev-environment.md` §7.
- When a tooling decision changes, update `docs/01-dev-environment.md` and add a line to its changelog (§16).

## Workflow

Spec first: owner writes `docs/specs/sprint-N.md` → `@architect` critiques it → branch → implement in small chunks → typecheck/lint/tests → review (`@gemini-reviewer`, and `@challenger` for anything touching the confirmation loop, offline sync, or RLS) → owner must be able to explain the diff before merge.

**Definition of done:** meets the spec's acceptance criteria, passes typecheck/lint/tests, respects the hard rules above, ships any migration and its RLS policy together, and comes with a plain-English summary.

## Commands (planned — not runnable until scaffolded)

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
