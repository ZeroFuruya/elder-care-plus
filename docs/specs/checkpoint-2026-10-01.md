# Checkpoint 2026-10-01 — acceptance decision sheet

Owner checkpoint (Thursday). Four decisions plus a diff review, prepared so the owner can accept or
reject each item in one sitting. Evidence cites recorded results only; nothing here is invented.

**Outcome (2026-10-01): all four decisions were granted by the owner — Sprint 1 accepted,
`sprint-1b.md` approved, `sprint-2.md` signed off, and the Sprint 4 diff approved for merge.**

**Branch of record:** the work was merged to `main` on 2026-10-01 — PR #1 (`967c86b`, the cutover)
and PR #2 (`cd1778f`, Sprints 2–4 + UI theme + validation hardening).

---

## A. Accept Sprint 1?

Schema first — accounts, roles, care circle, consent — plus the three security corrections frozen
2026-09-27. Already merged to `main`.

| # | Acceptance criterion | Evidence |
|---|---|---|
| 1 | Existing tests still pass | **124/124** Sprint 1 pgTAP assertions |
| 2 | Correction 1 — signup role is mandatory | Missing/unknown role fails; never defaults to `elder` |
| 3 | Correction 2 — server-verifiable re-auth | `amr` password timestamp ≤ 300 s for consent, unlink/revoke, deactivation, evidence access |
| 4 | Correction 3 — invite-code abuse protection | Authenticated redeemer, rate-limit/cooldown, six-digit codes, no plaintext storage, failed attempts audited |
| 5 | Sensitive writes stay guarded | RLS default-deny on every table; elder writes only their own due dose via a guarded RPC |
| 6 | Plain-English acceptance summary | This sheet |

**Decision (2026-10-01):** ☒ Accept  ☐ Reject. **Accepted by the owner.**

---

## B. Approve `docs/specs/sprint-1b.md`?

Supabase cutover: Auth, roles, care linking, hosted project, family shell.

- Status in the spec was "Draft for owner approval"; hosted verification evidence is appended.
- Implemented on `sprint-1b-supabase-cutover` and **merged to `main` via PR #1** (`967c86b`).
- Hosted project `buwwkdhzansbyeytsufj` is live; three synthetic demo accounts provisioned and
  role-verified under RLS; email confirmation off; 6-character minimum enforced.
- Delivery plumbing closed out on 2026-10-01: keep-alive repo secrets + a green manual dispatch,
  EAS `preview`/`production` env vars, and preview APK build `e2c86c9f`.

**Decision (2026-10-01):** ☒ Approve  ☐ Request changes. **Approved by the owner.**

---

## C. Sign off `docs/specs/sprint-2.md`?

Elder profile and emergency information (Flow G).

- Owner decisions on record: `E-07` incomplete-state strings; no re-auth for profile/number writes;
  audit rows only on state changes.
- **Implemented and shipped** on `sprint-2-elder-profile-emergency` — **60/60** pgTAP assertions.
- Status line corrected from "Implementation has not started" as part of this checkpoint.
- One follow-up settled the same day: the `C-01` first-run gate now shows a create-profile prompt
  instead of auto-redirecting to `A-09`, so the back button is never trapped (PR #3).

**Decision (2026-10-01):** ☒ Sign off  ☐ Request changes. **Signed off by the owner.**

---

## D. Review the Sprint 4 diff

Sprints 2–4 on top of the merged cutover: ~97 files, ~16.4k insertions.

| Area | files | +/− |
|---|---|---|
| `apps/mobile` | 67 | +8713 / −1207 |
| `supabase/migrations` | 5 | +2910 |
| `supabase/tests` | 4 | +2539 |
| `packages/shared` | 8 | +1129 / −3 |
| `docs/*` + `scripts` | 9 | +1094 / −301 |

Highest-scrutiny mechanics to confirm before merge:

- `dose_events` with `unique (schedule_id, scheduled_at)` — DB-level idempotency.
- `confirm_dose` guarded RPC using a conditional UPDATE (elder may write only their own due dose).
- `transition_missed_doses` is server-only; never granted to a client.
- Atomic batch decrement plus `inventory_transactions`, `audit_events` and `notifications` rows.
- Offline outbox retries without duplicating a `taken_at` or double-decrementing stock.
- Realtime on `dose_events` with a focus-refresh fallback.
- Minimal read-only family view scoped by `can_view_profile`.
- Validation hardening: DOB ≥ 18 and ≥ 1900-01-01, length and amount caps (**13** pgTAP assertions).

**Decision (2026-10-01):** ☒ Approve the diff  ☐ Request changes. **Approved and merged** (PR #2).

---

## E. Open items at this checkpoint

- ~~A-09 first-run gate: should the back-button bounce become a dashboard prompt?~~ **Settled
  2026-10-01: a dashboard prompt (PR #3).**
- `docs/02-ui-ux-standard.md` §16 unsaved-input confirmation *(documented follow-up)*.
- ~~Preview APK build~~ **Built** (`e2c86c9f`, commit `cc8ff92`) — install on the phone for the
  Oct 15/16 checking (`docs/checking-runbook-2026-10-15.md`).
- ~~Keep-alive repo secrets + manual dispatch~~ **Done**; keep-alive green on `main`. EAS env vars
  set.
- Consider a mobile component-test runner (new dev dependency — needs owner decision).

---

## Evidence appendix

- Local pgTAP: **394/394** — Sprint 1 = 124, Sprint 2 = 60, Sprint 3 = 96, Sprint 4 = 101,
  validation hardening = 13.
- Shared package tests: **113** passing.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:contrast` — green.
- Migrations: **11** applied locally and on hosted; `npx supabase migration list --linked` fully in
  sync.
- Hosted dumps taken before the final push (`backup.sql`, `backup-data.sql`; git-ignored).
