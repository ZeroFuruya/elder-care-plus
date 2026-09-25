# docs/adr

Architecture Decision Records, written by the owner in their own words after a
change is merged (docs/01-dev-environment.md section 10, step 7).

Naming: `adr-NNN-short-title.md`. Record the decision, the alternatives, and why
the choice was made — this is defense material.

## Scope decisions (resolved 2026-09-25)

Four conflicts between the approved design documents and `docs/00-product-flow.md`
(see `docs/02-ui-ux-standard.md` §20.2) blocked Sprint 1. The owner decided all four;
each ADR now records the accepted option and its follow-ups.

- `adr-001-third-user-role.md` — **Accepted: A** — "Connected Family Member" is a third role,
  modelled as care-circle membership. (C-R1)
- `adr-002-prescriptions-ocr-evidence.md` — **Accepted: A** — prescriptions, evidence and OCR stay
  in scope. (C-R2)
- `adr-003-stock-expiry-tracking.md` — **Accepted: A** — stock/expiry tracking stays in scope. (C-R3)
- `adr-004-emergency-contacts.md` — **Accepted: A** — ordered list of emergency numbers. (C-R4)

All four choose the product-flow scope over the approved v1.0 baseline, so the approved system
documentation and wireframes must be revised to match (tracked as a follow-up in each ADR).
