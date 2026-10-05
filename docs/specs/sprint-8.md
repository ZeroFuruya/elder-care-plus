# Sprint 8 — Family care circle UI (F-01 … F-15)

- **Status:** **Draft v1 (2026-10-06) with the owner's scope decision recorded; not implemented.**
  The owner asked to start Sprint 8 on 2026-10-06 and chose **Full A + B** for the checking scope
  (OD1). OD2–OD6 are still open and must be closed before Increment B's schema is written. This v1
  fixes the screen inventory and the reusable read path.
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
| F-11 | Help Requests | **yes — new table + RPCs** | elder-initiated asks; family receives/accepts |
| F-12 | Help Request Detail | **yes** | note, recipient scope, safety guidance |
| F-13 | Response Confirmation | **yes** | confirm ownership of an accepted request |
| F-14 | Family Care Circle | no | `listElderCircle`-style read of `care_links` |
| F-15 | Availability and Alerts | **yes — new table + prefs** | per-member availability + request notifications |

Everything in the "no" column reuses the **existing** RLS (`is_active_member_of`) and db wrappers; the
work is screens, navigation and tests, not schema. F-11…F-13 and F-15 are the only new backend.

## Proposed build order (two increments)

**Increment A — read-only care views + family navigation (no new schema).**
- Give the `(family)` shell its own tab set (Home, Medicines, Appointments, Care circle, More).
- `F-04` elder profile, `F-05`/`F-06` medication schedule + detail, `F-07`/`F-08` appointments,
  `F-09` emergency information, `F-10` care summary, `F-14` family care circle.
- Every screen is strictly read-only: no dose confirmation, no stock adjustment, no edit control, no
  device-calendar export. The permission boundary from the wireframe is a testable assertion.
- Reuse `Screen`, `Card`, `DetailRow`, `StatusPill`, `DoseCard`, and the Sprint 7 `AppointmentCard`.
- Tests: family reads succeed under RLS; every write path is refused (the existing grants already
  enforce this; add a family-role fetch that asserts the screens render no action control).

**Increment B — help requests + availability (new schema).**
- `help_requests` (+ responses) and availability preferences, with guarded RPCs and default-deny RLS.
- `F-11`/`F-12`/`F-13` family side; the elder's create/edit path (an `E-*` screen or a card on
  `E-01`).
- `F-15` availability + notification preferences; in-app notifications only (consistent with the
  Sprint 7 owner decision OD1).

## Owner decisions

- **OD1 — checking scope — DECIDED 2026-10-06: Full A + B.** Increment A (read-only care views +
  family navigation, no schema) and Increment B (help requests + availability, new backend) both land
  in Sprint 8. OD2–OD5 below still gate Increment B's design.
- **OD2 — help-request lifecycle.** Who may create (elder only, or caregiver on the elder's behalf)?
  States (`open` → `accepted` → `completed` | `cancelled`)? One accepting member, or many? Is a note
  required? Categories (urgent / practical / companionship)?
- **OD3 — availability model.** Per-member free-text, a simple available/not-available toggle, or
  per-day slots? Stored on `care_links` or a new `member_availability` table?
- **OD4 — notifications.** Confirm in-app only (no push/local), and which events alert: new request,
  acceptance, cancellation? Reuse `notifications` + `dedup_key` and the Sprint 7 sweep pattern?
- **OD5 — family navigation.** Tab bar vs. stack; and do F-01/F-02 stay as the pre-consent flow
  already built in Sprint 1b?
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
