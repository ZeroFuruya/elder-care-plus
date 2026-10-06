# Sprint 8 — Family care circle UI (F-01 … F-15)

- **Status:** **Implemented and locally verified (2026-10-06); both increments on `sprint-7-appointments`.**
  The owner asked to start Sprint 8 on 2026-10-06 and chose **Full A + B** for the checking scope (OD1),
  then decided OD2–OD4 (below). Increment A (read-only care views + family navigation) and Increment B
  (help requests + availability + device notifications) are both implemented. All checks green:
  `pnpm typecheck`/`lint`/`format:check`, **143** JS tests, `npx supabase test db` **550/550** (Sprint 8
  adds 34 assertions: 8 policy + 26 help/availability). Two migrations pushed to hosted
  (`20261106120000`, `20261107120000`; 16/16 in sync).
- **Depends on:** Sprint 1b (family role, `(family)` shell, care-link invite/consent), Sprint 2
  (elder/emergency read), Sprint 3 (medication plan read), Sprint 4 (dose activity + the minimal
  family view already shipped), Sprint 7 (appointments read; the appointments RLS already admits
  `is_active_member_of`).
- **Supersedes:** the Sprint 1b deferral "complete read-only family UI, help requests, and
  availability to Sprint 8" (`docs/AGENTS.md` family-role decision).

## Screen inventory (source: `docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf`)

| Frame | Title | Backend needed | Notes |
|---|---|---|---|
| F-01 | Join Care Circle | exists | `apps/mobile/src/app/(family)/family/link.tsx` (invite code) |
| F-02 | Access and Consent | exists | consent copy inside the join flow |
| F-03 | Family Home | partial | current `family/index.tsx` is the read-only snapshot |
| F-04 | Elder Profile | no | Sprint 2 read path + RLS already allow active members |
| F-05 | Medication Schedule | no | Sprint 3/4 read path already allows active members |
| F-06 | Medication Detail | no | same read path; read-only, no stock actions |
| F-07 | Appointments | no | Sprint 7 read path already allows active members |
| F-08 | Appointment Detail | no | Sprint 7 read path; **no** device-calendar export for family |
| F-09 | Emergency Information | no | Sprint 2 read path |
| F-10 | Care Summary | partial | the current home already shows doses + a summary line |
| F-11 | Help Requests | **done** (`help_requests` + RPCs) | elder-initiated asks; circle receives/accepts |
| F-12 | Help Request Detail | **done** | note, category, accept/complete |
| F-13 | Response Confirmation | **done** | in-app confirmation banner after accept |
| F-14 | Family Care Circle | **one additive policy** | co-member read of `care_links` (§Increment A) |
| F-15 | Availability and Alerts | **done** (`member_availability` + device notify) | per-member toggle + note; local device notification |

Everything in the "no" column reuses the **existing** RLS (`is_active_member_of`) and db wrappers; the
work is screens, navigation and tests, not schema. F-11…F-13 and F-15 are the only new backend.

## Proposed build order (two increments)

**Increment A — read-only care views + family navigation (implemented 2026-10-06).**
- Give the `(family)` shell its own tab set (Home, Meds, Visits, Help, More) with the detail
  routes registered `href: null`; the care circle and availability live under More.
- `F-03`/`F-10` home + care summary, `F-04` elder profile, `F-05` medication schedule, `F-06`
  medicine detail, `F-07`/`F-08` appointments, `F-09` emergency information, `F-14` family care
  circle.
- Every screen is strictly read-only: no dose confirmation, no stock adjustment, no edit control, no
  device-calendar export. The permission boundary from the wireframe is a testable assertion.
- Reuses `Screen`, `Card`, `DetailRow`, `StatusPill`, `DoseCard`, and the Sprint 7 `AppointmentCard`.
- **One additive policy:** `care_links_select_active_circle` lets an active member read the elder's
  **active** links so `F-14` can show the caregiver and relatives. Pending (`invited`) rows stay
  hidden from co-members and visible only to the elder and the invited member, so consent state is
  never leaked. Migration `20261106120000_sprint8_family_ui.sql` + 8 pgTAP assertions.
- Tests: the policy proof plus the existing RLS already refusing every family write.

**Increment B — help requests + availability (implemented 2026-10-06).**
- `help_requests` and `member_availability`, with five guarded RPCs and default-deny RLS. Migration
  `20261107120000_sprint8_help_requests.sql` + 26 pgTAP assertions.
- `F-11`/`F-12`/`F-13` family side (`help.tsx`, `help-detail.tsx`), the elder create/cancel screen
  (`(elder)/elder/help.tsx`, reached from `E-01`), and a caregiver view (`(caregiver)/caregiver/help.tsx`,
  reached from the notification centre and Profile) because the elder notifies **every** active member.
- `F-15` availability (`(family)/family/availability.tsx`), shown per member on `F-14`.
- Notifications reuse the Sprint 5/7 `notifications` table with four new events; `help_requests` is
  published for Realtime and `useHelpRequestNotifications` mirrors an event to a **local device
  notification** (owner OD4). There is no remote push service; the device mirror fires while the app
  is running and connected, and the in-app centre stays the source of truth.

## Owner decisions

- **OD1 — checking scope — DECIDED 2026-10-06: Full A + B.** Increment A (read-only care views +
  family navigation, no schema) and Increment B (help requests + availability, new backend) both land
  in Sprint 8. OD2–OD5 below still gate Increment B's design.
- **OD2 — help-request lifecycle — DECIDED 2026-10-06: the recommended default.** The elder creates
  (Urgent / Practical / Companionship, optional note ≤ 500 chars) and **every** active care-circle
  member is notified. The first member to accept claims it; the elder or the accepter completes it;
  the elder cancels. States `open → accepted → completed | cancelled`, all timestamped, never hard
  deleted. The creator is always the elder (`help_requests_creator_is_elder`).
- **OD3 — availability model — DECIDED 2026-10-06: toggle + note.** One `member_availability` row per
  (elder, member): Available / Not available plus an optional note ≤ 200 chars. Shown on `F-14`.
- **OD4 — notifications — DECIDED 2026-10-06: in-app + device.** Four new notification events
  (`help_request_created/accepted/completed/cancelled`) reuse `notifications` + `dedup_key`; the
  client mirrors each to a local device notification. No remote push service is used (budget).
- **OD5 — family navigation — DECIDED 2026-10-06 by Increment A:** five tabs (Home, Meds, Visits,
  Circle, More); F-01/F-02 remain the pre-consent flow already built in Sprint 1b.
- **OD6 — copy.** As in Sprints 3 and 5, all new rendered strings and accessibility labels will be
  proposed as a traceable batch for approval before merge.

## Out of scope

- Any family **write** on care records (the hard permission boundary).
- Emergency dispatch, messaging, photo sharing, or a family-to-caregiver chat.
- Reports/retrieval analytics (Sprint 9).
- Changing the existing `care_links` consent/revoke rules.

## Risks

- **Scope.** Increment B is effectively a second feature sprint inside Sprint 8; the owner's OD1
  answer decides whether it lands before the checking.
- **RLS drift.** New tables must ship their policies **with** the migration and default deny;
  family reads use `is_active_member_of`, writes use guarded RPCs.
- **Copy drift.** Help-request wording must never imply emergency dispatch or medical advice.
