# docs/specs

One spec per sprint: `sprint-N.md`. The **owner writes it first**; `@architect`
critiques it before any implementation starts (docs/01-dev-environment.md section 10).

A spec contains: goal, user stories, acceptance criteria, screens, data touched,
and out-of-scope.

`sprint-1.md` exists (accounts, roles, care circle, consent — schema first). It was written and
implemented at the owner's request on 2026-09-25; the security closeout addendum (frozen
2026-09-27) adds three owner-required corrections. The owner's review and acceptance are still
outstanding — checkpoint 2026-10-01.

`sprint-1b.md` (Supabase cutover: Auth, roles, care linking, hosted project, family shell) is a
draft written 2026-09-29 for the same checkpoint. The owner reviews it and `@architect` critiques
it before implementation starts.

Three forward drafts were written 2026-09-29 at the owner's request and planned with `@architect`;
they need the owner's review before implementation:

- `sprint-2.md` — elder profile and emergency information (Flow G: `elder_profiles`,
  `emergency_numbers`), aimed at the 2026-10-08 checkpoint.
- `sprint-3.md` — medication and inventory setup (Flow B: `medications`, `medication_schedules`,
  `medicine_batches`), the setup half of the medication cycle.
- `sprint-4.md` — daily medication adherence (Flow C: `dose_events`, guarded confirmation,
  notifications, offline queue, minimal family view), the **2026-10-15/16 checking deliverable**.
