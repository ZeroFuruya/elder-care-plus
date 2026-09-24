# ADR-003 — Is medicine stock / expiry / batch tracking in scope?

- **Status:** Proposed — **decision pending with the owner**.
- **Date:** 2026-09-24.
- **Conflict:** `docs/02-ui-ux-standard.md` §20.2 **C-R3**.
- **Prepared by:** the main coder as a decision brief. The owner makes the call and may rewrite
  this file in their own words.
- **Blocks:** Sprints 3 and 5 (`01-dev-environment.md` §11).

## Context

Both **approved design documents** exclude this feature:

- System documentation v1.0 §1.4 (out of scope): "**Medicine stock tracking, pharmacy ordering,
  payments or insurance processing**."
- System documentation v1.0 §7.2 entity list: Medication, Dose Schedule, Dose Event and
  Appointment — there is **no batch or inventory entity**.
- Wireframe `C-02` build note: **"No stock or refill tracking."** `C-03` (Add/Edit Medication)
  has no batch, quantity, lot, expiry or low-stock-threshold field. No frame renders a stock
  status.

The repo's own sources put it **in** scope:

- `docs/00-product-flow.md` Flow B and Flow D ("Inventory and expiry safety flow"), the
  `medicine_batches` and `inventory_transactions` tables, and §8's "expire/low stock is never
  represented by color alone".
- `packages/shared/src/inventory.ts`: six `StockStatus` values (`normal`, `low`, `out`,
  `expiring`, `expired`, `needs_review`).
- `01-dev-environment.md` §11 Sprint 3 and Sprint 5; `AGENTS.md`'s idempotency rule explicitly
  covers "inventory decrement" and "double-decrement stock".

## Options

**A. Keep stock/expiry (product-flow scope).**
- *Needs:* revised system documentation + wireframes with batch and inventory screens; the
  idempotent decrement is already required by `AGENTS.md`, so the DB work is unchanged.
- *Gains:* a stronger safety story (expired medicine is blocked from generating a `take` prompt),
  and it exercises the idempotency requirement more fully.
- *Costs:* more screens (`C-16`-ish batch editor, stock adjustment, expiry alerts), more audit
  surface, more places to go wrong; contradicts the approved baseline.

**B. Drop stock/expiry (approved-doc scope).**
- *Needs:* delete `inventory.ts` and its `StockStatus`, drop Sprints 3/5's inventory halves,
  remove inventory from the `AGENTS.md` idempotency rule and `00-product-flow.md`, and remove the
  `needs_review` "reminders suppressed" behaviour.
- *Gains:* code and approved documents agree; a much smaller Sprints 3/5; the confirmation loop
  (the product's actual differentiator) gets the effort instead.
- *Costs:* loses the "expired medicine can't be confirmed" safety behaviour; the idempotency
  demonstration is narrower (dose events only).

**C. Keep the data model, drop the UI for now.**
- *Needs:* keep `inventory.ts` and the tables, but ship no stock screens in v1.0.
- *Gains:* a migration path without committing the UI.
- *Costs:* a table and enum nothing consumes; dead code is a defense question ("why does this
  exist?").

## Recommendation

**B**, unless the owner wants the expiry-safety story as an explicit thesis contribution — in
which case **A** and the approved documents must be revised. The deciding question:
*"Is stock/expiry management part of the problem I am claiming to solve?"* The product's stated
differentiator is the confirmation loop (elder confirms → caregiver notified → missed-dose
escalation); stock tracking is adjacent to that, not part of it. Note that the dose-confirmation
loop demos perfectly well **without** inventory, and the `AGENTS.md` idempotency rule can be
rewritten to be about dose events alone.

## Decision

- [ ] **Owner:** chosen option and reason.
- [ ] If B: remove `inventory.ts`, `StockStatus`, the stock UI, and the inventory mentions in the
      hard rules and sprint map.

## Consequences

- **A:** new batch/inventory/expiry screens and alerts; `inventory_transactions` audit trail;
  revised approved documents.
- **B:** `inventory.ts` and `stockStatusPresentation` deleted; Sprint 5 removed; `00-product-flow`
  Flow D removed; `AGENTS.md` idempotency rule narrowed to dose events.
- **C:** dead code and tables; not recommended.
