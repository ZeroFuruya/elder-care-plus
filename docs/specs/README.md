# docs/specs

One spec per sprint: `sprint-N.md`. The **owner writes it first**; `@architect`
critiques it before any implementation starts (docs/01-dev-environment.md section 10).

A spec contains: goal, user stories, acceptance criteria, screens, data touched,
and out-of-scope.

`sprint-1.md` exists (accounts, roles, care circle, consent — schema first). It was written and
implemented at the owner's request on 2026-09-25; the security closeout addendum (frozen
2026-09-27) adds three owner-required corrections. **Accepted by the owner 2026-10-01**
(`checkpoint-2026-10-01.md`); implemented, tested (124/124 pgTAP) and merged to `main`.

`sprint-1b.md` (Supabase cutover: Auth, roles, care linking, hosted project, family shell) was
drafted 2026-09-29 and revised the same day to fold in the `@architect` critique, with hosted
verification evidence appended. **Approved by the owner 2026-10-01**; implemented on
`sprint-1b-supabase-cutover` and merged to `main` via PR #1, with the hosted project live and
role-verified.

`sprint-2.md` (elder profile and emergency information, Flow G) was reviewed by a second
`@architect` pass on 2026-09-29 and approved for implementation that day. Owner decisions: the
`E-07` incomplete-state strings, no re-authentication for profile/number writes, and audit rows
only on state changes. **Signed off by the owner 2026-10-01**; implemented and shipped on
`sprint-2-elder-profile-emergency` (60 pgTAP assertions).

`sprint-3.md` (medication and inventory setup — `medications`, `medication_schedules`,
`medicine_batches`) and `sprint-4.md` (daily adherence — `dose_events`, guarded confirmation,
notifications, offline queue, minimal family view, the **2026-10-15/16 checking deliverable of
record**) were both approved by the owner on 2026-09-30, implemented on `sprint-3-medication-setup`
and `sprint-4-medication-adherence`, and reviewed and accepted at the 2026-10-01 checkpoint. Their
migrations are applied locally and on the hosted project, and their copy batches and deviations are
approved. A validation-hardening pass (date-of-birth ≥ 18 / ≥ 1900, length and amount caps) followed
on the Sprint 4 branch. `pg_cron 1.6.4` and `pg_net 0.20.4` are available on the hosted Free
project.

**Checkpoint:** `checkpoint-2026-10-01.md` records the four acceptances (Sprint 1, `sprint-1b.md`,
`sprint-2.md`, Sprint 4 review), all granted 2026-10-01.

`sprint-5.md` (inventory and expiry safety, Flow D) was **drafted 2026-10-05** and revised to
**v2** the same day after an `@architect` critique, as the first of the remaining sprints to be
wrapped up before the 2026-10-15/16 checking. It is **awaiting owner approval**. The owner's
`needs_review` decision (suppress only when a batch exists but is invalid) and the frame-ID
decision (reuse `C-04` plus a confirmation dialog) are recorded in the spec; the open items are the
adjustment-reason list, the no-batch display label, the sweep time, and warning-window
configurability.

**Scope change 2026-10-05:** the owner has cut **all AI/OCR and photo evidence** from the app and the
final presentation. **Sprint 6 is dropped** (see the amended `adr-002-prescriptions-ocr-evidence.md`),
so the remaining sequence is **Sprint 5 → 7 (appointments) → 8 (family UI) → 9 (reports/retrieval)**.
`AGENTS.md` and `01-dev-environment.md` still need reconciling with this decision.
