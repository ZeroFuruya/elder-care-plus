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

`sprint-5.md` (inventory and expiry safety, Flow D) was **drafted 2026-10-05**, revised to **v2**
the same day after an `@architect` critique, **approved by the owner 2026-10-05**, and
**implemented** on `sprint-5-inventory-expiry`. `npx supabase db reset` applies its migration
cleanly, `npx supabase test db` is **444/444** (Sprint 5 adds 50 assertions), and the branch was
pushed. The hosted project was backed up (`backup.sql`, git-ignored) and the migration pushed
2026-10-06, so all 12 migrations are in sync there. The owner **approved the adjust-stock dialog copy
batch on 2026-10-06**. Merged to `main` 2026-10-06 (`6c03bfa`).

`sprint-7.md` (appointments, Flow F) was **drafted 2026-10-06**, the owner closed its six decisions
the same day, and an `@architect` critique returned **"Needs changes"**; **v2** folds in all 19
must-fix items and was **approved by the owner 2026-10-06**. It is **implemented** on
`sprint-7-appointments` (stacked on the merged Sprint 5 tip): migration, RLS, four guarded RPCs and
the guarded reminder sweep with 52 pgTAP assertions (**496/496** total), the shared appointment
contracts and the widened notification vocabulary, caregiver and elder appointment screens, the
dashboard next-appointment cards, and the elder's device-calendar export (a native `expo-calendar`
dependency, so the demo needs a **fresh APK**). **Revision v3** records the implemented timezone
contract: the write RPCs take a local date + time + zone and convert server-side with Sprint 4's
`local_dose_timestamp`. It also carries the prerequisite fix for a Sprint 5 gap: the shared
notification event schema was never widened, so Sprint 5 stock alerts mis-rendered as `Taken` in
`S-01`; Sprint 7 widens it and routes by event + target. The hosted project was backed up
(`backup.sql`, git-ignored) and the migration **pushed 2026-10-06**, so all **13** migrations are in
sync; a non-mutating hosted smoke confirmed signed-out reads/writes are `42501`, the sweep RPC is
server-only, both demo accounts sign in, appointments reads are RLS-scoped, and every cross-account
write returns the authorization guard. Awaiting review/merge.

`docs/specs/sprint-4b-dose-reactivation.md` (restore future doses when a deactivated medicine is
reactivated) was **drafted 2026-10-06** by owner request. It is a bug fix, not a feature sprint: one
`create or replace` of `reconcile_dose_events_for_medication` reopening future `plan_deactivated`
occurrences that still match the current active plan and schedule, plus a pgTAP regression file. **Not
implemented; awaiting owner approval.**

`docs/specs/sprint-8.md` (Family care circle UI, F-01…F-15) was **drafted 2026-10-06** by owner
request with a two-increment scope and six open decisions. Increment A (read-only care views + family
navigation) needs **no schema**; Increment B (help requests + availability) is a new backend and is
gated on the owner's scope decision. **Not implemented; awaiting owner decisions.**

**Scope change 2026-10-05:** the owner has cut **all AI/OCR and photo evidence** from the app and the
final presentation. **Sprint 6 is dropped** (see the amended `adr-002-prescriptions-ocr-evidence.md`),
so the remaining sequence is **Sprint 5 → 7 (appointments) → 8 (family UI) → 9 (reports/retrieval)**.
`AGENTS.md` and `01-dev-environment.md` still need reconciling with this decision.
