# ADR-001 — Is "Connected Family Member" a third user role?

- **Status:** **Accepted** — option A, the third role is implemented (owner decision, 2026-09-25).
- **Date:** 2026-09-24.
- **Conflict:** `docs/02-ui-ux-standard.md` §20.2 **C-R1**.
- **Prepared by:** the main coder as a decision brief. The owner makes the call and may rewrite
  this file in their own words (`docs/adr/README.md`).
- **Blocks:** Sprint 1. This touches the role enum, the data model, every RLS policy, the route
  tree and the auth flow.

## Context

The approved wireframe pack v1.2 (*Connected Family*) adds **15 screens, `F-01`…`F-15`**, for a
third user level called **Connected Family Member**: joining a care circle, access and consent,
read-only care view, help requests with response ownership, and availability. The pack's stated
reason is an instructor requirement of **"3 distinct user levels × 15 screens = 45"**.

Every other source assumes two roles:

- **Approved system documentation v1.0** §2.1 lists exactly two roles (Older Adult, Family
  Caregiver); §2.2 says "Version 1.0 permits **one active caregiver link** for one elder
  account"; §1.4 lists **"Multiple caregivers per elder, in-app chat, video calls or social
  feeds"** as explicitly **out of scope**.
- `docs/00-product-flow.md` §2: "One active caregiver-to-one elder link."
- `docs/01-dev-environment.md` §4.2: mobile-only, no moderator/admin web app.
- `packages/shared/src/role.ts`: `z.enum(['caregiver', 'elder'])`.
- `apps/mobile/src/app/(auth)/role-select.tsx`: two role cards.

So C-R1 is the **only** conflict where the v1.2 pack stands alone against every other source.

## Options

**A. Implement the third role.**
Add `family_member` to the role enum, a care-circle/invitation/consent model, and per-role RLS.
- *Gains:* literally satisfies the instructor's feature requirement; a richer product.
- *Costs:* the largest single change in the project. Every table's RLS policy needs a third
  branch; `care_links` becomes a many-to-many "care circle" with invitation + consent state;
  consent changes need re-authentication; three route groups instead of two; owner must be able
  to defend a much bigger authorization model. It also **contradicts the approved baseline**, so
  the system documentation would need re-approval.

**B. Keep two implemented roles; treat `F-01`…`F-15` as design-only frames.**
Ship the Figma/prototype frames to satisfy a *design* deliverable, and implement the two-role
product the system documentation approves.
- *Gains:* no schema, RLS or auth change; matches the approved baseline; keeps Sprint 1 small.
- *Costs:* if the requirement is about *implemented* user levels, this does not satisfy it.
- *First step:* **ask the instructor** whether the 45 screens are a Figma deliverable or a
  working capability. The requirement as quoted ("3 distinct user levels × 15 screens") sounds
  like a *screens* requirement.

**C. Compromise — a read-only viewer scope, not a full role.**
Model the family member as a narrowly-scoped grant on the existing `care_links` (view-only
token) rather than a new `profiles.role`.
- *Gains:* smaller than A; satisfies "a third level" in a demo.
- *Costs:* still an authorization redesign, still contradicts §2.2's "one active link" and §1.4;
  a "role that is not a role" is hard to defend at the defense.

## Recommendation

Start with **B**, and put the question to the instructor this week. If the instructor needs a
working third level, take **A** — not C — because A is honest about the model and C invites
"why is your third role not a role?" If A is chosen, the approved system documentation v1.0 must
be revised to say so, and §1.4's "multiple caregivers per elder" line must change.

## Decision

**Owner: A — implement the third role.** Decided 2026-09-25.

- The care circle is modelled as membership rows on `care_links`, with
  `member_role ∈ (caregiver, family_member)` and `access_level ∈ (manage, view)`.
- Cardinality: **one caregiver (the manager) + N family members (view-only).**
- Consent: **caregiver invites → elder consents → the member redeems the code and accepts →
  active.** Revoking a link, and any change to consent, require re-authentication.
- Help requests and availability (the rest of `F-01`…`F-15`) are deferred to a dedicated family
  sprint.

Follow-up:

- The approved system documentation v1.0 must be revised: §2.2's "one active caregiver link" stays
  (there is still exactly one manager), but §1.4's "multiple caregivers per elder" must be
  rewritten to permit read-only family members.
- `packages/shared/src/role.ts` and the `(family)` route group move with the family UI sprint; the
  database role enum leads, so the two are intentionally out of step until then.

## Consequences if A/B/C

- **A:** `role.ts`, `role-select.tsx`, `care_links` → care-circle, new tables for invitations,
  help requests and availability; RLS rewritten everywhere; new `(family)` route group; Sprint 1
  and the data-model section of the thesis both grow.
- **B:** `role.ts` unchanged; add a note in `docs/02-ui-ux-standard.md` §8.4 that `F-` frames are
  design-only; Sprints unchanged.
- **C:** `care_links` gains a viewer scope; RLS gains a "read-only linked viewer" branch.
