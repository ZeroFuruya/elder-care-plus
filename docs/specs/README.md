# docs/specs

One spec per sprint: `sprint-N.md`. The **owner writes it first**; `@architect`
critiques it before any implementation starts (docs/01-dev-environment.md section 10).

A spec contains: goal, user stories, acceptance criteria, screens, data touched,
and out-of-scope.

`sprint-1.md` exists (accounts, roles, care circle, consent — schema first). It was written and
implemented at the owner's request on 2026-09-25; the security closeout addendum (frozen
2026-09-27) adds three owner-required corrections. **Implemented, tested (124/124 pgTAP) and
merged to `main`; the owner's acceptance is the 2026-10-01 checkpoint decision.**

`sprint-1b.md` (Supabase cutover: Auth, roles, care linking, hosted project, family shell) was
drafted 2026-09-29 and revised the same day to fold in the `@architect` critique, with hosted
verification evidence appended. **Implemented on `sprint-1b-supabase-cutover` and merged to `main`
via PR #1; the hosted project is live and role-verified. Awaiting the owner's approval at the
2026-10-01 checkpoint.**

`sprint-2.md` (elder profile and emergency information, Flow G) was reviewed by a second
`@architect` pass on 2026-09-29 and approved for implementation that day. Owner decisions: the
`E-07` incomplete-state strings, no re-authentication for profile/number writes, and audit rows
only on state changes. **Implemented and shipped** on `sprint-2-elder-profile-emergency`
(60 pgTAP assertions); awaiting the owner's formal sign-off.

`sprint-3.md` (medication and inventory setup — `medications`, `medication_schedules`,
`medicine_batches`) and `sprint-4.md` (daily adherence — `dose_events`, guarded confirmation,
notifications, offline queue, minimal family view, the **2026-10-15/16 checking deliverable of
record**) were both approved by the owner on 2026-09-30 and implemented on
`sprint-3-medication-setup` and `sprint-4-medication-adherence`. Their migrations are applied
locally and on the hosted project, and their copy batches and deviations are approved. A
validation-hardening pass (date-of-birth ≥ 18 / ≥ 1900, length and amount caps) followed on the
Sprint 4 branch. `pg_cron 1.6.4` and `pg_net 0.20.4` are available on the hosted Free project.
