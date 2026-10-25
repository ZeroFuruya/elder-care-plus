# Presentation evidence — 2026-10-23

Filled during the dry-run and again at the presentation. This sheet is the evidence of record for the
thesis: one complete medication-adherence transaction cycle on the installed preview APK against the
**hosted** Supabase project, plus the help-request and reports passes.

Operational script: `docs/presentation-runbook-2026-10-23.md`. The demo uses **three brand-new
accounts registered in-app** (dummy emails, easy passwords chosen by the presenter); the
pre-provisioned demo accounts and `scripts/provision-demo-circle.mjs` are **not** used. Never print,
commit or screen-share the passwords.

> Status: **skeleton — not yet filled.** Replace every `TBD` during the dry-run. Every database value
> below is **scoped to the demo IDs**; never write a table-wide count (setup and earlier runs leave
> other rows, and history is never hard-deleted).

## Build under test

| Field | Value |
|---|---|
| EAS build id | `939eec2d-c005-462d-8608-8048b3d9e72e` (2026-10-25; replaces `b5134e38`) |
| Git commit | `db63867` (the commit the APK was built from; later commits are docs/scripts only) |
| `versionCode` | **5** |
| Package | `com.zerofuruya.eldercareplus` |
| Hosted project | `buwwkdhzansbyeytsufj.supabase.co` (19 migrations; Sprint 10 pushed 2026-10-25) |
| Sprint 10 client | **Rebuilt APK** `939eec2d` carries the native `expo-image-picker`; 4d runs on that build |
| Device / Android version | `TBD` |
| Date/time of dry-run | `TBD` |

## Pre-flight

| # | Check | Expected | Observed | Pass |
|---|---|---|---|---|
| 1 | `npx supabase migration list --linked` | All 19 in sync | 19 local ↔ remote in sync (2026-10-25) | ☑ |
| 2 | Keep-alive workflow run | Green | Supabase keep-alive green, 2026-10-10 (scheduled) | ☑ |
| 3 | APK `939eec2d` installed and launches | Launches, connects to hosted | TBD | ☐ |
| 4 | Three fresh accounts registered in-app (runbook §1.1) | Caregiver, elder, family each sign in; each sees only its own data | TBD | ☐ |
| 5 | Care circle linked in-app (runbook §1.2–§1.4) | Caregiver + family links active, elder profile present | TBD | ☐ |
| 6 | Connectivity | Requests succeed | TBD | ☐ |
| 7 | Pre-demo `db dump` | File written (git-ignored) | TBD | ☐ |
| 8 | Fresh cycle state | New plan has no confirmation yet (not "table empty") | TBD | ☐ |
| 9 | `cron.job` has `transition-missed-doses` | Present or §5 is a limitation | TBD | ☐ |

## Test cases — demo of record (medication cycle)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver adds medicine + schedule (today's weekday, now + 5 min, grace 120) + batch (on, matching unit, future expiry, qty ≥ dose), activates | Plan saved and active | TBD | `TBD` |
| 2 | `ensure_dose_events` generates the dose | Dose visible on caregiver and elder | TBD | `TBD` |
| 3 | Elder pull-to-refresh until Due, then taps **Mark as taken** once | Dose shows Taken | TBD | `TBD` |
| 4 | Caregiver dashboard (pull-to-refresh) | Taken + timestamp + stock decreased by exactly the dose + unread notification | TBD | `TBD` |
| 5 | Caregiver marks notification read (`S-01`) | Unread → read, opens the related record | TBD | `TBD` |
| 6 | Family Home (read-only) | Care summary (7/30/90 range), plan + dose rows, appointments, care circle | TBD | `TBD` |

## Test cases — idempotency (headline claim; laptop, not APK)

The confirm button disappears after success, so this is proven by calling `confirm_dose` twice as the
elder's JWT (SQL/REST) against the same dose.

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | First `confirm_dose` call | `duplicate: false`, `taken_at` set once | TBD | `TBD` |
| 2 | Second `confirm_dose` call (same dose) | Returns `duplicate: true` | TBD | `TBD` |
| 3 | Re-check the database after the retry | **No** new `taken_at`, stock, inventory, audit or notification row | TBD | `TBD` |
| 4 | Name the guards | Unique dose occurrence key; one-time conditional confirmation; unique dose-decrement inventory key | TBD | — |

## Database after the run (read-only, scoped to the demo IDs)

| Table | Scoped query | Expected | Observed |
|---|---|---|---|
| `dose_events` | by demo `schedule_id` | One settled row, `taken_at` set once | TBD |
| `inventory_transactions` | by demo `source_dose_event_id` | One row, stock decremented by the dose | TBD |
| `audit_events` | `target_id = <demo-dose>` and `action = 'dose.confirmed'` | One row | TBD |
| `notifications` | `related_id = <demo-dose>` | One row, unread → read | TBD |

## Help-request cycle (Sprint 8)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Elder asks for help (category + note) | Request created; elder not notified of own ask | TBD | `TBD` |
| 2 | Circle notified | Caregiver + every active family member get in-app notification; device notification when app foregrounded with permission | TBD | `TBD` |
| 3 | First member offers to help | `open → accepted`, accepter recorded; a second member cannot claim it | TBD | `TBD` |
| 4 | Mark as done | `accepted → completed` | TBD | `TBD` |
| 5 | Member availability | Available / Not available + note shows on care circle (`F-14`) | TBD | `TBD` |

## Reports and history (Sprint 9)

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver `C-09` report, 7/30/90 | Per-day count list grows with the range (7 vs 30 vs 90 rows); **no per-medicine breakdown**; totals unchanged with one dose | TBD | `TBD` |
| 2 | Caregiver `C-12` timeline | Merged audit + stock events, newest first | TBD | `TBD` |
| 3 | Elder `E-08` | Same range selector, scoped to the elder | TBD | `TBD` |
| 4 | Family `F-10` summary | Range honoured; the **report RPC payload** is counts + dates only | TBD | `TBD` |

## Prescription photo (Sprint 10; needs the rebuilt APK)

Storage only — no OCR, no AI. Verified non-mutating on hosted during the 2026-10-25 push (anon
`select` on `medication_images` → `401/42501`; anon `register_medication_image` /
`archive_medication_image` → `401/42501`; the `prescription-images` bucket exists, `public=false`,
10 MB cap). The table, RLS and both RPCs are covered by 42 pgTAP assertions (641/641 local).

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Caregiver attaches a photo to a medicine (camera or library) | Uploads to the private bucket, row registered, photo shows on `C-04` | TBD | `TBD` |
| 2 | Tap the thumbnail | Full image via a short-lived signed URL | TBD | `TBD` |
| 3 | Elder and family open the same medicine | Same photo, read-only, no add/remove | TBD | `TBD` |
| 4 | Caregiver removes the photo | Row archived (`is_archived=true`), the stored object is **kept**; `medication_image.archived` audit row written | TBD | `TBD` |
| 5 | Signed-out API probe | Anon reads/writes of `medication_images` and its RPCs are refused (`42501`) | ☑ 2026-10-25 | `TBD` |
| 6 | State the guardrail | No OCR/AI: the image is stored and shown to humans only; it never fills a field | TBD | — |

## Negative proof (missed dose) — evidence-gated

| # | Step | Expected | Observed | Screenshot |
|---|---|---|---|---|
| 1 | Leave a dose past its grace | Shows Missed (client-derived) | TBD | `TBD` |
| 2 | `pg_cron` transition | Only claim if the scheduled transition is **actually observed** (`missed_at` / notification) | TBD | `TBD` |

## Screenshot set

| Screen | Captured | Notes |
|---|---|---|
| `C-02`/`C-03` plan setup | ☐ | |
| `C-01` caregiver dashboard (due) | ☐ | |
| `E-01`/`E-03` elder due + Mark as taken | ☐ | |
| `C-01` caregiver Taken + stock | ☐ | |
| `S-01` notification read | ☐ | |
| `F-*` family read view | ☐ | |
| `C-09` / `C-12` / `E-08` | ☐ | Day list grows with the range |
| Help request + availability | ☐ | |
| `C-04` prescription photo (add + view) + family read-only | ☐ | Sprint 10; needs the rebuilt APK |
| Idempotency RPC responses + counts | ☐ | Laptop |

## Sign-off

| Item | Done |
|---|---|
| Dry-run passed end to end | ☐ |
| Evidence complete | ☐ |
| Known limitations recorded (proactive missed-dose `pg_cron`; no remote push; card gradient fallback) | ☐ |
