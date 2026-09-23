# ElderCare+ - AI Product Flow and Build Brief (v1.1)

## 1. Product in one sentence

ElderCare+ helps an older adult follow a caregiver-managed medication plan, while the linked family caregiver sees adherence, medicine stock/expiry risks, prescriptions, appointments, and emergency information.

It is a care-coordination and record-keeping app, **not** a diagnostic, prescribing, interaction-checking, emergency-dispatch, or pharmacy-ordering service.

## 2. Roles and authority

| Capability | Family caregiver | Elder |
| --- | --- | --- |
| Link care account and manage elder profile | Create/manage | Consent to link; view |
| Medication plan, schedules, stock, expiry | Create/edit/deactivate | View only |
| Mark a scheduled dose as taken | View event only | Confirm own dose only |
| Prescription record and evidence | Create, verify, archive | View verified prescriptions; optionally submit a photo for review |
| Appointments | Create/edit/complete/cancel | View and receive reminders |
| Emergency information/numbers | Manage | View and call |
| Reports, alerts, audit trail | View | View personal daily history only |

One active caregiver-to-one elder link is the initial release model. Link codes are six digits, single-use, and expire after 24 hours. Never hard-delete medical history; deactivate or archive records and keep timestamps.

## 3. Navigation

**Caregiver tabs:** Dashboard, Medicines, Prescriptions, Appointments, Profile. Reports are reached from Dashboard; Emergency is a prominent dashboard/profile action.

**Elder tabs:** Today, Medicines, Prescriptions, Appointments, Emergency. Account/settings and notification center are available from the top bar.

All screens show a notification bell. Emergency is always reachable in one tap from the elder home screen. Use large controls, 48 dp minimum touch targets (56 dp for `Mark as taken`), readable text, and status text/icons in addition to color.

## 4. End-to-end flows

### A. First use and care linking

1. User creates an account, verifies email/phone, selects `caregiver` or `elder`, and is told why notifications are needed.
2. Caregiver completes elder profile: identity, allergies, conditions, blood type, care instructions, doctor, address, and emergency numbers.
3. Caregiver generates a link code. Elder enters it, sees the caregiver identity/access summary, and explicitly confirms.
4. The active link opens role-specific home screens. An unlinked elder sees only linking/help/settings; an unlinked caregiver completes the profile and shares a code.

### B. Medication, inventory, and expiry setup

1. Caregiver adds medicine: name, strength/form, dose quantity/unit, instructions, start/end dates, repeat days/times, and missed-dose grace period (default 30 minutes; allowed 5-120 minutes).
2. Caregiver optionally adds one or more medicine batches: quantity, matching unit, lot number, expiry date, low-stock threshold, pharmacy/refill contact, and active batch. A batch is needed for stock/expiry tracking, but not for a medication plan.
3. Caregiver can link the medicine to an existing prescription or create a prescription record. The app warns about duplicate active medicine names/schedules; it never decides whether medicines interact.
4. The system creates future dose events only for active medication schedules. Changes affect future events; historical events remain immutable.

### C. Daily medication adherence

1. At the scheduled time, the elder receives a local reminder and opens the exact due-dose detail.
2. The elder reads medicine, strength, instructions, scheduled time, and status, then selects `Mark as taken` only after taking it.
3. A server-controlled action records exactly one `taken_at` timestamp. If an active inventory batch uses the same unit as the dose, it decreases stock by the dose quantity and writes an inventory transaction.
4. The caregiver immediately receives the confirmation after sync. Offline confirmations are visibly `Pending sync`; retrying cannot duplicate a dose or stock decrement.
5. If not confirmed by the grace period, the event becomes `missed` and the caregiver receives a needs-attention alert. Do not alter history to hide a missed event.

**Dose state:** `upcoming -> due -> taken` or `upcoming -> due -> missed`. `taken` and `missed` are terminal except for an explicitly audited correction flow.

### D. Inventory and expiry safety flow

1. Stock is `normal`, `low`, `out`, `expiring`, or `expired` from active-batch quantity and expiry date.
2. Warn the caregiver at 30, 14, 7, and 1 days before expiry (configurable) and when quantity reaches the low-stock threshold. Notify the elder only with a simple `Contact your caregiver about this medicine` message.
3. An expired batch cannot be the active batch. If no valid active batch remains, the medicine is `needs caregiver review`: future reminders for that medicine are suppressed and both users see a non-clinical contact instruction. The app must never suggest a substitute, change a dose, or tell the elder to stop treatment.
4. Caregiver adds a replacement batch, selects it as active, and resumes the plan after reviewing it. Manual stock adjustments require a reason and create an audit event.

### E. Prescriptions and photo evidence

1. Caregiver creates a prescription with title/label, prescriber, issue date, optional valid-until date, notes, linked medicines, and status (`draft`, `verified`, `expired`, `archived`).
2. Caregiver uploads one or more photo evidences (camera or library). Elder may submit a photo, but it remains `pending_review` until caregiver verification.
3. The app validates file type/size, uploads directly to a **private** Supabase Storage path, records file metadata/checksum, and shows a preview through a short-lived signed URL.
4. Caregiver visually verifies the image and manually reviews every medicine/schedule before adding or changing a plan. OCR or AI output is reference-only and can never auto-create prescriptions, schedules, doses, or clinical advice.
5. Elder opens `Prescriptions` -> list of verified/current prescriptions -> detail -> linked medicines and read-only photo evidence. Expired/archived prescriptions remain viewable with a clear status, not silently removed.

### F. Appointments: visit or in-home

1. Caregiver creates an appointment with type `visit` or `in_home`, title, date/time, reminder, provider, and notes.
2. For `visit`, require clinic/facility and location. For `in_home`, default to the elder address and require/confirm visit address, visitor/provider name, and contact number.
3. Both users receive the configured reminder (default 24 hours). Elder can view details and use `Call provider`/`Open map` where available; no one can edit from the elder role.
4. Caregiver marks it `completed` or `cancelled`; past unfinished items are `overdue`. On completion, caregiver can attach a follow-up prescription photo or note without overwriting the original appointment data.

**Appointment state:** `upcoming -> completed | cancelled`; past `upcoming` displays as `overdue` until resolved.

### G. Emergency flow

1. Elder opens Emergency from Today or the Emergency tab; caregiver opens it from Dashboard/Profile.
2. Display verified identity, allergies, conditions, blood type, care instructions, active medicines, primary doctor, and ordered emergency numbers.
3. Emergency numbers include local emergency service, primary caregiver, alternate family contact, doctor/clinic, and optional pharmacy. Each number has a label, phone number, priority, and verified timestamp.
4. Tapping a number opens the device dialer for user confirmation. The app does not call, dispatch, or share location automatically.

## 5. Core screens

| Area | Minimum screens |
| --- | --- |
| Access/linking | Welcome, sign up/in, role selection, verification, notification permission, caregiver profile setup, generate/enter/confirm link code |
| Elder | Today, schedule, dose detail/confirmed state, medicines/history, prescriptions list/detail/evidence viewer, appointments list/detail, emergency, settings |
| Caregiver | Dashboard, medicines list/detail, add/edit medicine, batch/inventory editor, stock adjustments, prescriptions list/detail/editor/evidence review, appointments list/detail/editor, reports, elder profile, emergency number editor |
| Shared states | Notification center, loading, empty, offline/pending sync, permission denied, validation error, destructive confirmation, system error |

## 6. Data model

| Entity | Essential fields / rules |
| --- | --- |
| `profiles` | `id` = `auth.users.id`, `role`, name, contact preferences |
| `care_links` | caregiver ID, elder ID, status, code hash/expiry, consent timestamps; one active link per side |
| `elder_profiles` | demographics, address, allergies, conditions, blood type, care instructions, doctor |
| `emergency_numbers` | elder ID, label/type, phone, priority, verified timestamp, active flag |
| `medications` | elder ID, name, strength/form, dose qty/unit, instructions, dates, active status, linked prescription |
| `medication_schedules` | medication ID, days, local time, grace period, timezone, active flag |
| `medicine_batches` | medication ID, quantity/unit, low threshold, lot, expiry, refill contact, active flag; only one active supplier batch per medicine |
| `inventory_transactions` | batch ID, delta, reason, source dose event/actor, timestamp; immutable audit trail |
| `dose_events` | schedule ID, scheduled time, status, `taken_at`, sync state; unique per schedule occurrence |
| `prescriptions` | elder ID, prescriber, dates, status, notes, creator/verifier timestamps |
| `prescription_medicines` | prescription-to-medication join; never infer a treatment plan from an image alone |
| `prescription_evidence` | prescription ID, private storage path, MIME/size/checksum, uploader, review status, reviewer/time |
| `appointments` | elder ID, `visit`/`in_home`, state, time, provider, conditional location/address/contact fields, reminders, notes |
| `notifications` | recipient, event type, related record, read state, delivery/sync status |
| `audit_events` | actor, action, target, before/after summary, timestamp; required for status, stock, and care-plan changes |
| `document_chunks` | care link/prescription ID, approved extracted text, `embedding vector`; optional private semantic retrieval only |

Use UTC timestamps plus the schedule timezone. Enforce unique dose events at the database layer. Store quantities as decimals with a unit; auto-decrement only when batch and dose units are identical, otherwise require caregiver adjustment.

## 7. Supabase and mobile implementation

**Client:** React Native + Expo, TypeScript, Expo Router. Use typed route groups: `(auth)`, `(caregiver)`, `(elder)`, and shared detail routes. Use Expo Notifications for local dose reminders/push alerts, Expo Image Picker/Camera for evidence, SecureStore for session-sensitive values, and a local queue (for example Expo SQLite) for offline confirmations.

**Backend:** Supabase Free with Auth, Postgres, Storage, RLS, Realtime/Edge Functions where needed, and `pgvector`.

- Auth: email/password verification, password reset, session refresh, role stored in `profiles` rather than trusted client state.
- Postgres: migrations, foreign keys, check constraints, database unique indexes, RPCs/Edge Functions for dose confirmation, missed-dose transition, inventory decrement, link-code redemption, and signed uploads.
- Storage: private `prescription-evidence` bucket; object path includes elder/prescription UUIDs; no public health-document URLs; signed URLs only.
- RLS: unrelated users receive no rows. Caregiver accesses only the active linked elder and may manage care records. Elder can read only their linked care records and may change only their own due dose through a guarded RPC. Elder-uploaded evidence is insert-only/pending-review. Service role is server-only.
- Notifications: notification text is minimal on lock screens; full medical details appear only after authenticated in-app navigation.
- `pgvector`: store embeddings only for caregiver-approved extracted prescription text/chunks. Retrieval is filtered by the active care link and prescription ID before vector similarity search. It supports private `find in my prescriptions`/context retrieval, not diagnosis, drug interaction analysis, or autonomous care changes.

## 8. Rules, validations, and safeguards

- Medication requires name, instructions, dose unit/quantity, and at least one valid schedule. End date cannot precede start date.
- Batch quantity/unit must be valid; expiry cannot precede batch entry date; expire/low stock is never represented by color alone.
- Emergency number requires label, valid phone number, and priority. The caregiver must verify local emergency-service details for the elder's region.
- Prescription evidence accepts only supported image/PDF MIME types and bounded size; reject executable/untrusted file types. Strip/avoid exposing unnecessary image metadata where feasible.
- Appointment type is required. `visit` requires facility/location; `in_home` requires confirmed address and provider/visitor contact.
- A caregiver cannot silently overwrite a confirmed dose, stock adjustment, prescription verification, or historical appointment state; all such actions require confirmation and audit logging.
- Consent, unlink, account deletion, and evidence access changes require re-authentication and explain their effect. Keep health data out of analytics and public logs.
- The UI repeats caregiver-entered instructions exactly and always directs unclear, expired, or inconsistent medicine information to a caregiver or qualified health professional.

## 9. Acceptance scenarios

1. Caregiver links an elder, adds a medicine, valid batch, schedule, prescription evidence, emergency numbers, and both appointment types.
2. Elder receives a dose reminder, confirms once, sees Taken state, and caregiver sees the timestamp and reduced stock exactly once after sync.
3. Low stock and approaching expiry trigger caregiver alerts; an expired active batch is blocked and does not generate a `take` prompt.
4. Caregiver replaces the batch, reviews/resumes the medicine, and all prior dose/stock history remains intact.
5. Elder opens verified prescription evidence but cannot edit it; a photo submitted by elder is invisible as verified until caregiver review.
6. Appointment conditional fields, reminders, completion/cancellation, and follow-up evidence work for both `visit` and `in_home`.
7. Both linked roles can view Emergency and open the dialer; unrelated accounts cannot read any elder, document, or storage record.
8. Offline dose confirmation visibly queues, syncs once after reconnection, and never duplicates a dose event or stock transaction.
