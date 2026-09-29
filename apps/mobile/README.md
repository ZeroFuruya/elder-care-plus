# apps/mobile

Expo + Expo Router client for ElderCare+. **Mobile-only** — the caregiver, older
adult and connected family member use the same app, separated by typed route
groups.

> Read [`docs/02-ui-ux-standard.md`](../../docs/02-ui-ux-standard.md) before changing
> anything under `src/`. It is normative on design tokens, the status-presentation
> contract, accessibility and copy rules, and it wins over the existing code.

> **Branch state (2026-09-29).** This branch signs in against Supabase; the
> local-SQLite demo is preserved by the tag `demo-sqlite-fallback`. Server
> migrations, RLS and the RPCs live in [`supabase/`](../../supabase/), and the
> cutover contract is [`docs/specs/sprint-1b.md`](../../docs/specs/sprint-1b.md).

## Routes

| Route                                                                            | Screen                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/welcome`, `/sign-in`, `/sign-up`                                               | onboarding and account screens                                        |
| `/elder`, `/elder/meds`, `/elder/calendar`, `/elder/profile`, `/elder/emergency` | older adult tabs (dose confirmation arrives with the medication loop) |
| `/elder/link`, `/elder/circle`                                                   | enter a caregiver code; approve or remove access                      |
| `/caregiver`, `/caregiver/meds`, `/caregiver/calendar`, `/caregiver/reports`     | caregiver tabs                                                        |
| `/caregiver/link`, `/caregiver/profile`                                          | link code, family invites, revoke; account                            |
| `/family`, `/family/link`                                                        | read-only family view; enter an invite code                           |

The role folders are nested inside their route groups (`(caregiver)/caregiver/…`) on
purpose: route groups are URL-transparent, so a flat `meds.tsx` in each group would both
resolve to `/meds`. Nesting keeps `/caregiver/meds` and `/elder/meds` distinct.

## Data layer

**Supabase is authoritative** for identity, roles, care links, dose events, inventory
and audit history. Clients hold only the public anon key; RLS is the boundary, and every
write goes through a guarded RPC (see `src/db/linking.ts` and `supabase/migrations/`).
The session lives in `expo-secure-store` through the chunked adapter in
`packages/shared/src/chunked-storage.ts`.

The local `expo-sqlite` store (`src/db/database.ts`, `doses.ts`) is legacy: it backs the
tagged offline demo build and the current screens' honest empty states. No reachable
screen writes medication data locally.

Demo accounts are no longer seeded on the device. Create the synthetic accounts and
their care circle with the runbook in `docs/specs/sprint-1b.md` ("Synthetic demo setup
runbook"). Every fixture is synthetic — never put real elder or caregiver health data
here.

## Running it

```bash
pnpm --filter mobile start        # Expo dev server — scan the QR with Expo Go
pnpm --filter mobile typecheck
pnpm --filter mobile lint
```

Copy `.env.example` to `.env` (git-ignored) and set `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` for the project you are testing against. Only
`EXPO_PUBLIC_` values may reach the app; never the service-role key.

**Web is not a supported target.** `expo-sqlite`'s web worker cannot resolve its
`wa-sqlite.wasm` under this pnpm workspace, so `expo start --web` fails to bundle
(HTTP 500). Test on a device or emulator through Expo Go.

## Accessibility baseline

Large controls, **48 dp minimum touch targets** (56 dp for `Mark as taken`), readable text,
and status conveyed by **text/icons in addition to colour**. Tokens live in
`src/constants/theme.ts`; `pnpm check:contrast` enforces the contrast rules.
