# ADR-004 — One emergency contact, or an ordered list of numbers?

- **Status:** **Accepted** — option A, ordered list (owner decision, 2026-09-25).
- **Date:** 2026-09-24.
- **Conflict:** `docs/02-ui-ux-standard.md` §20.2 **C-R4**.
- **Prepared by:** the main coder as a decision brief. The owner makes the call and may rewrite
  this file in their own words.
- **Blocks:** Sprint 2 (`01-dev-environment.md` §11: `elder_profiles`, `emergency_numbers`).

## Context

Both **approved design documents** define **one** contact:

- System documentation v1.0 FR-03: "The caregiver can maintain identity, blood type, conditions,
  allergies, care instructions, primary doctor and **one emergency contact**."
- System documentation v1.0 §7.2: "**Emergency Contact — Primary person and call number.**"
- §6.2 `E-07`: "…care instructions, doctor and **Call contact**."
- Wireframe `C-11` / `F-09` show a single emergency contact (name, relationship, phone); `E-07`
  shows "Call Ana - emergency contact" plus one `Verified by caregiver` timestamp.

The repo's own source is **richer**:

- `docs/00-product-flow.md` §4 G3: emergency numbers include local emergency service, primary
  caregiver, alternate family contact, doctor/clinic and optional pharmacy.
- §7 (`emergency_numbers` table): each number has `label/type`, `phone`, **`priority`**,
  `verified timestamp`, `active flag`.
- §5: "Emergency number requires label, valid phone number, and priority."
- `01-dev-environment.md` §11 Sprint 2 lists `emergency_numbers` (plural).

## Options

**A. Keep the ordered list (product-flow scope).**
- *Needs:* revised approved documents; `emergency_numbers` with `priority`; an edit screen for
  multiple numbers; a `S-03`/`E-07` layout that stays one screen with 5 rows (the pack designed
  for one big Call button).
- *Gains:* genuinely more useful in an emergency (who to call for what), and it is what the
  hard rules and sprint map already assume.
- *Costs:* more fields to keep verified; the "one tap" emergency action becomes a list, which is
  slower and riskier for a confused elder — the exact audience this app is for.

**B. One contact (approved-doc scope).**
- *Needs:* drop the `emergency_numbers` table in favour of a single contact on `elder_profiles`;
  drop the `priority` concept; keep the single big `Call` action.
- *Gains:* the elder experience stays a single unambiguous action; matches every approved frame;
  less to verify and keep current.
- *Costs:* loses the "call the doctor, not the caregiver" distinction; the local emergency
  service number cannot be stored separately.

**C. Hybrid — one dominant contact, with an optional secondary list.**
- *Needs:* one `primary` contact rendered as the big `Call` button (`E-07` unchanged), plus a
  collapsed "Other numbers" section backed by `emergency_numbers`.
- *Gains:* preserves the pack's one-tap design **and** keeps the richer data.
- *Costs:* two concepts to model and label; must be worded so an elder never hesitates over the
  main button.

## Recommendation

**C.** The pack's single big `Call` action is the right elder experience and should not be
replaced by a list; but a lone contact cannot express "call the doctor" vs "call an ambulance",
which matters in a medical app. C keeps the approved `E-07` layout dominant and puts the ordered
numbers behind a disclosure. If the owner wants the smallest possible Sprint 2, **B** is
defensible — it is precisely what the approved baseline says — provided the `00-product-flow.md`
§7 table and §5 rule are updated to match.

## Decision

**Owner: A — keep the ordered list of emergency numbers.** Decided 2026-09-25 (product-flow scope).

- `emergency_numbers` keeps `label`, `phone`, `priority`, `verified_at` and `active`.
- The elder screen keeps one dominant action; the ordered list holds local emergency service,
  primary caregiver, alternate family contact, doctor/clinic and optional pharmacy.
- The caregiver must verify the local emergency-service details for the elder's region.

Follow-up: the `E-07` one-contact frames must be revised to carry the ordered list behind the
dominant action.

## Consequences

- **A:** `emergency_numbers` + edit screen; revised `E-07`/`C-11`; §4 G3 kept.
- **B:** single contact on `elder_profiles`; `emergency_numbers` and `priority` removed from
  `00-product-flow.md` §7 and §5; Sprint 2 shrinks.
- **C:** `elder_profiles.primary_emergency_contact` + `emergency_numbers` for the rest; `E-07`
  unchanged with a disclosure section.
