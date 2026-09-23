# AGENTS.md

## Status

Docs-only repository. There is **no source code, no `package.json`, no git repo, and no `opencode.json` yet** — only `docs/` and this file. Do not assume a stack from the directory; the stack is already decided in `docs/01-dev-environment.md` §4. The commands listed there are **targets: they will fail until the repo is scaffolded.** Do not scaffold or start implementing without an approved sprint spec and an explicit owner request.

## Required reading before any work

1. `docs/00-product-flow.md` — product source of truth (roles, screens, flows, data model, hard rules). **Wins on product scope.**
2. `docs/01-dev-environment.md` — tooling source of truth (stack, services, workflow, model roster). **Wins on tooling.**

These are long and full of **decided** choices (do not silently swap tools, services, or models). Read both in full before feature or setup work. The summary below is not a substitute.

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
