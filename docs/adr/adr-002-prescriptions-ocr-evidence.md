# ADR-002 — Are prescriptions, photo evidence and OCR in scope?

- **Status:** **Accepted** — option A, product-flow scope (owner decision, 2026-09-25).
- **Date:** 2026-09-24.
- **Conflict:** `docs/02-ui-ux-standard.md` §20.2 **C-R2**.
- **Prepared by:** the main coder as a decision brief. The owner makes the call and may rewrite
  this file in their own words.
- **Blocks:** Sprint 6 (`01-dev-environment.md` §11), the `services/ai` surface, and the model
  roster's purpose.

## Context

Both **approved design documents** exclude this feature:

- System documentation v1.0 §1.4 (out of scope): "**AI or RAG medical assistant**, diagnosis,
  treatment advice or drug-interaction decisions", and "QR medical profile, public share links
  or lock-screen medical records".
- System documentation v1.0 §11.1: "Data minimization: **no location, microphone, camera,
  contacts or SMS permission in version 1.0**."
- The v1.2 wireframe pack contains **zero** mentions of prescription, evidence, photo, scan, OCR
  or embedding across all 45 screens.

The repo's own sources put it **in** scope:

- `docs/00-product-flow.md` Flow E ("Prescription record and evidence"), the `prescriptions`,
  `prescription_medicines`, `prescription_evidence` and `document_chunks` tables, and the private
  `prescription-evidence` storage bucket.
- `apps/mobile/app.json` declares `expo-image-picker` with camera and photo permission copy.
- `packages/shared/src/prescription.ts`; `(elder)/elder/prescriptions.tsx`;
  `(caregiver)/caregiver/prescriptions.tsx`.
- `services/ai` exposes `/ocr` (currently `501`), and `AGENTS.md` hard rules require
  "Elder-submitted prescription evidence stays `pending_review` until the caregiver verifies it"
  and "OCR/AI output is reference-only".

**The tension that matters:** `docs/00-product-flow.md` is the "**AI** Product Flow and Build
Brief", and the AI/OCR pipeline is plausibly the thesis's AI contribution. Removing it may remove
the thing the thesis is being assessed on. Keeping it means re-approving the system documentation
and wireframes, because they currently say "no camera" and "no AI assistant".

## Options

**A. Keep prescriptions + photo evidence + OCR/embeddings (product-flow scope).**
- *Needs:* a revised system documentation + wireframe pack with prescription screens, a camera
  permission rationale in §11.1, and consent copy covering photographs. New screens beyond the
  45 (e.g. an elder "submit a photo" flow, a caregiver "review evidence" flow).
- *Gains:* the thesis keeps its AI component and its reference-only guardrail story.
- *Costs:* contradicts the current approved baseline; more screens, more RLS (private storage,
  signed URLs), more surface for privacy review.

**B. Drop prescriptions, photo evidence and OCR entirely (approved-doc scope).**
- *Needs:* delete `prescription.ts` exports and the three screens, remove the `expo-image-picker`
  plugin and permission copy from `app.json`, retire `/ocr`, drop Sprint 6, and rewrite the
  `AGENTS.md` hard rules and `01-dev-environment.md` §2/§4.1.
- *Gains:* the code and the approved documents finally agree; smaller, cleaner scope; no camera
  permission at all, which is a strong privacy story.
- *Costs:* the AI service shrinks to embeddings only (or nothing), which may weaken the thesis.

**C. Defer the decision; keep the schema but build no UI.**
- *Needs:* leave `prescription.ts`, the placeholder screens and the `501` endpoint in place, and
  remove the camera permission from `app.json` until a screen actually needs it.
- *Gains:* nothing is built ahead of an unresolved decision, and the privacy posture stays clean.
- *Costs:* Sprint 6 stays undefined, so the sprint order has a hole.

## Recommendation

**C now, then A or B after one question to the adviser: "Is an AI/ML component required for this
thesis?"**
- If **yes** → A, and the system documentation + wireframe pack must be revised (a documented
  change of the approved baseline, which is normal and defensible).
- If **no** → B, and the AI service should be re-scoped honestly rather than left half-built.
Do not leave `app.json` requesting camera access while no screen uses it (C's housekeeping step)
— a permission the product does not use is a privacy-review liability.

## Decision

**Owner: A — keep prescriptions, photo evidence and OCR.** Decided 2026-09-25 (product-flow scope).

- `prescriptions`, `prescription_medicines`, `prescription_evidence` and `document_chunks`, plus the
  private `prescription-evidence` bucket, stay in the schema.
- The reference-only guardrail stands: OCR/AI output never auto-creates or auto-fills a medicine,
  schedule, dose or clinical advice; the caregiver reviews and enters every field.
- Elder-submitted evidence stays `pending_review` until the caregiver verifies it.

Follow-up: the approved system documentation §11.1 ("no camera permission in version 1.0") must be
revised to record the evidence-upload rationale and consent copy covering photographs.

## Consequences

- **A:** new screens (not in the 45), private storage + signed-URL RLS, camera permission,
  revised §11.1, `audit_events` on evidence review.
- **B:** `prescription.ts` and two screens deleted, `app.json` camera plugin removed, `/ocr`
  retired, Sprint 6 removed, hard rules trimmed.
- **C:** unresolved; do not start Sprint 6.
