# ElderCare+

Family-centered care-coordination and record-keeping app for older adults.
A family caregiver manages the elder's medication plan, inventory/expiry,
prescriptions, appointments and emergency info; the elder views their plan and
confirms their own doses.

> **Not** a diagnostic, prescribing, drug-interaction-checking, emergency-dispatch
> or pharmacy-ordering service. That boundary governs every feature.

This is a thesis project. Product scope lives in `docs/00-product-flow.md`; tooling
and workflow live in `docs/01-dev-environment.md`. When the two disagree on product
scope, the product-flow doc wins; on tooling, the dev-environment doc wins.

## Repository layout

```
apps/mobile/       Expo + Expo Router client (caregiver and elder; mobile-only)
services/ai/       FastAPI service: prescription OCR + caregiver-approved embeddings
packages/shared/   shared TypeScript types and zod schemas
supabase/          local config, migrations, synthetic seed
docs/              product flow, dev environment, specs, ADRs, diagrams, thesis
.github/workflows/ CI + Supabase keep-alive cron
```

## Prerequisites

| Tool                 | Needed for                         | Notes                                                            |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Node LTS + pnpm      | mobile app, shared package         | `corepack enable` then `corepack prepare pnpm@latest --activate` |
| Docker Desktop       | `npx supabase start` (local stack) | **not installed on the owner's machine yet**                     |
| Python 3.12 + uv     | `services/ai`                      | uv can install Python itself                                     |
| Expo Go on the phone | daily mobile work                  | avoids burning the small EAS build quota                         |
| Supabase CLI         | migrations                         | used via `npx supabase`, no global install needed                |

## Quickstart

```bash
pnpm install                  # install the whole workspace
pnpm typecheck                # TypeScript across all packages
pnpm lint
pnpm test

pnpm --filter mobile start    # Expo dev server (scan with Expo Go)

cd services/ai && uv sync && uv run uvicorn main:app --reload
```

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and `services/ai/.env.example`
to `services/ai/.env` when you have local values. **`.env*` files are git-ignored;
only `EXPO_PUBLIC_` values may be public.**

## Status

Scaffold only. The navigation skeleton, workspace config, AI-service contract, and
bootstrap migration exist; there is **no product schema and no auth yet**. Feature
work starts once `docs/specs/sprint-1.md` is written and approved.

## Non-negotiable rules

- Synthetic elder/caregiver fixtures only — in dev, tests, and anything sent to an
  AI tool.
- Never hard-delete medical history; deactivate or archive with timestamps.
- Idempotency is enforced at the database layer, not in client code.
- RLS on every table, default deny; the service-role key is server-only.
- Never convey status by color alone; 48 dp touch targets (56 dp for `Mark as taken`).
- Never suggest a substitute medicine, change a dose, or tell the elder to stop
  treatment.

See `AGENTS.md` for the full list and the required workflow.
