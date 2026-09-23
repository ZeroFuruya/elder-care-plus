# apps/mobile

Expo + Expo Router client for ElderCare+. **Mobile-only** — both roles use this same
app, separated by typed route groups:

- `src/app/(auth)/` — welcome, sign in/up, role selection
- `src/app/(caregiver)/` — Dashboard, Medicines, Prescriptions, Appointments, Profile
- `src/app/(elder)/` — Today, Medicines, Prescriptions, Appointments, Emergency

These are navigation skeletons. Real screens arrive per sprint with an approved spec
under `docs/specs/`. See `../../docs/01-dev-environment.md` sections 4.2, 6 and 8.4.

## Accessibility baseline (product hard rule)

Large controls, **48 dp minimum touch targets** (56 dp for `Mark as taken`), readable
text, and status conveyed by **text/icons in addition to color**. Tokens live in
`src/constants/theme.ts`.

## Commands

```bash
pnpm --filter mobile start      # Expo dev server (use Expo Go on the phone)
pnpm --filter mobile typecheck
pnpm --filter mobile lint
```
