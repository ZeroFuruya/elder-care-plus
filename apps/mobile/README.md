# apps/mobile

Expo + Expo Router client for ElderCare+. **Mobile-only** — both roles use the same app,
separated by typed route groups.

> Read [`docs/02-ui-ux-standard.md`](../../docs/02-ui-ux-standard.md) before changing
> anything under `src/`. It is normative on design tokens, the status-presentation
> contract, accessibility and copy rules, and it wins over the existing code.

## Routes

| Route                              | Screen                                     |
| ---------------------------------- | ------------------------------------------ |
| `/welcome`, `/sign-in`, `/sign-up` | onboarding and account screens             |
| `/elder`                           | Home — today's doses, with `Mark as taken` |
| `/elder/meds`                      | Medicines (read-only)                      |
| `/elder/calendar`                  | Calendar                                   |
| `/elder/emergency`                 | Emergency card                             |
| `/elder/profile`                   | Profile and settings                       |
| `/caregiver`                       | Dashboard                                  |
| `/caregiver/meds`                  | Medicines                                  |
| `/caregiver/calendar`              | Calendar                                   |
| `/caregiver/reports`               | Reports (adherence)                        |
| `/caregiver/profile`               | Elder profile, emergency numbers, account  |

The role folders are nested inside their route groups (`(caregiver)/caregiver/…`) on
purpose: route groups are URL-transparent, so a flat `meds.tsx` in each group would both
resolve to `/meds`. Nesting keeps `/caregiver/meds` and `/elder/meds` distinct.

## Data layer

A local **`expo-sqlite`** database under `src/db/`, seeded with synthetic fixtures in
`src/db/demo.ts`. No network, no Docker and no credentials, so a live demo cannot fail on
connectivity. Swapping to Supabase later means replacing `db/users.ts` and `db/doses.ts`
and adding RLS — the screens do not change.

Demo accounts (password `demo1234` for both). The sign-in screen can fill either one for you:

| Role             | Email                 |
| ---------------- | --------------------- |
| Family caregiver | `maria@eldercare.app` |
| Older adult      | `ana@eldercare.app`   |

Every fixture is synthetic. Never put real elder or caregiver health data here.

## Running it

```bash
pnpm --filter mobile start        # Expo dev server — scan the QR with Expo Go
pnpm --filter mobile typecheck
pnpm --filter mobile lint
```

**Web is not a supported target.** `expo-sqlite`'s web worker cannot resolve its
`wa-sqlite.wasm` under this pnpm workspace, so `expo start --web` fails to bundle
(HTTP 500). Test on a device or emulator through Expo Go.

## Accessibility baseline

Large controls, **48 dp minimum touch targets** (56 dp for `Mark as taken`), readable text,
and status conveyed by **text/icons in addition to colour**. Tokens live in
`src/constants/theme.ts`; `pnpm check:contrast` enforces the contrast rules.
