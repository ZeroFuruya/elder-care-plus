# Sprint 9 — Reports and history browsing

- **Status:** **Draft v2 (2026-10-06) — awaiting owner approval. No implementation before approval.**
  Drafted by request (the owner chose **full reports/retrieval**), then revised after an independent
  `@architect` critique (session `ses_eeeb75265ffeX2JEcenexNABPJ`, analyze-only) returned **"Needs
  changes"**; v2 folds in the 20 must-fix items (below). Next: owner sign-off, then an implementation
  branch.
- **Critic:** `@architect` session `ses_eeeb75265ffeX2JEcenexNABPJ`. Must-fix mapping: audit exposure
  vs OD3 (MF1/MF18), `total` semantics (MF2), percentage typing (MF3), null/inclusive range (MF4),
  authorization isolation tests (MF5), deactivated callers (MF6), `scheduled_local_date` wording
  (MF7), cancelled+terminal precedence (MF8), index fit (MF9), inventory vocabulary (MF10),
  stock-history date contract (MF11), family payload boundary (MF12), grant verification (MF13), audit
  rendering safety (MF14), frame-id collisions (MF15), screen state matrix (MF16), pgTAP coverage
  (MF17), "retrieval" naming (MF19), regression gate (MF20).
- **Flow:** `docs/00-product-flow.md` §2 (capability table — reports are role-scoped), §5 (caregiver
  **reports**), §6 (`dose_events`, `inventory_transactions`, `audit_events`), §8 (never hard-delete
  history). `docs/02-ui-ux-standard.md` §6 (status never by colour alone), §8.4 (frame catalogue),
  §12 (destructive confirmation), §13 (minimal text).
- **Depends on:** Sprint 1 (`audit_events` + its select policy + `is_manager_of`/
  `is_active_member_of`/`can_view_profile`/`is_elder_self`), Sprint 3 (`medications`,
  `medication_schedules`), Sprint 4 (`dose_events` with `scheduled_local_date`, `inventory_transactions`,
  `confirm_dose`), Sprint 5 (`reason`/`adjustment_reason`, stock vocabulary), Sprint 8 (family shell).
- **Supersedes:** the stub caregiver **Reports** screen (`reports.tsx`, 7-day client-only summary) and
  the "reports/retrieval" stretch item in `AGENTS.md`. It adds the care-activity and personal-adherence
  views the frame catalogue already defines.
- **Removals already binding (2026-10-05):** AI/OCR and prescription evidence are cut from the app, so
  **prescriptions are out of scope** and this sprint does **history browsing** — filtered, read-only
  review of retained records — **never** embeddings or semantic search. `pgvector`/`document_chunks`
  are not used.

## Owner decisions (proposed — confirm or change at approval)

- **OD1 — report ranges.** Fixed options **7 / 30 / 90 days** (no custom date picker), default **7**.
  The report buckets on each dose's stored, immutable `scheduled_local_date` (the schedule's local
  calendar date captured at generation), so it is independent of the device timezone and of the
  2026-10-05 Hermes IANA issue that Sprint 7 worked around.
- **OD2 — family access (capability table §2).** The connected family member sees the **adherence
  summary only**: per-day and total **counts** and a confirmation rate, with **no** dose ids,
  medication ids/names, timestamps, or any medication detail. This is enforced by the **shape of the
  RPC payload** (counts and dates only), not only by a hidden control. The elder (`E-08`) and the
  caregiver (`C-09`) share the same RPC.
- **OD3 — audit-trail screen audience.** The `C-12` care-activity screen is **caregiver-manager only**;
  an active family member reads **zero** `audit_events` rows (RLS). **Correction (MF1/MF18):** the
  database policy also lets an account read rows it **acted on** and lets the elder read their own
  elder-scoped rows; Sprint 9 adds **no** elder/family audit UI and makes **no** new exposure. See OD8.
- **OD4 — "history browsing", not "retrieval".** Client-side, read-only **filtering** over the
  server-bounded rows: a date range plus a stock-medicine filter/text filter. **No** server-side
  full-text search, **no** embeddings, and filters do not reach beyond the loaded range.
- **OD5 — export/share.** **Out of scope.** No PDF/CSV export, share sheet, or print.
- **OD6 — inventory vocabulary (MF10).** A ledger row has `reason ∈ {dose_confirmed,
  manual_adjustment}` **and** `adjustment_reason ∈ {restock, correction, damage, waste,
  count_adjustment}` (null for `dose_confirmed`). The history shows "Dose taken from stock" for the
  automatic row and the `adjustment_reason` label for a manual adjustment; the labels come from the
  shared Sprint 5 map so the history and the stock editor never diverge.
- **OD7 — no new native dependency.** Every screen is a read over existing tables, so Sprint 9 adds
  no native module and does **not** by itself force an APK rebuild (Sprint 8's rebuild already covers
  the demo).
- **OD8 — `audit_events` policy (new; MF1/MF18).** Today's policy admits the actor, the elder self,
  and the manager. **Recommended: leave it unchanged** and record the elder's own-row read as a
  documented, pre-existing boundary (no elder/family UI path; tightening a security policy on the
  critical path is the riskier option). Alternative: a forward migration restricting elder-scoped
  audit reads to the manager only. **Owner to choose.** Either way the spec must not claim the audit
  table is manager-only at the DB boundary.

## Goal

Give each role a faithful, read-only view of retained history at its authority level: a
server-aggregated **adherence report**; a caregiver **care-activity timeline** (audited changes and
stock movements); the elder's **personal adherence**; and a family **care summary** over a selectable
range. Nothing is written, nothing is deleted, and no view suggests a medicine change or clinical
advice.

## User stories

1. As a caregiver manager, I can open Reports and see the confirmation rate and the day-by-day trend
   for the last 7, 30 or 90 days; a day with a missed dose carries text + icon, not colour alone.
2. As a caregiver manager, I can open the Care Activity Timeline and see a plain-language, newest-first
   trail of audited care changes and stock movements (who, what, when), read-only, filterable.
3. As an older adult, I can open Personal Adherence and see my own days, read-only: how many doses were
   confirmed and which were missed, with no editing control.
4. As a connected family member, I can see the adherence summary (counts and rate) over 7/30/90 days
   on the family Home and nothing more.
5. As an unrelated account, I can read nothing on any of these screens.

## Screens

Frame IDs are from the approved catalogue (`docs/02-ui-ux-standard.md` §8.4); the v1 draft's
`C-10`/`C-11`/`E-13`/`F-16` were collisions and are corrected here (MF15). Every screen reuses
existing components and stays light/dark compatible with 48 dp targets.

- **`C-09` Adherence Report** (caregiver) — extends the current `reports.tsx`. A range selector
  (7/30/90, `ChoiceChips`), the overall confirmation rate, a per-day trend (counts + the shared missed
  marker, text + icon), the missed-dose list, and one entry point: **Care Activity Timeline (`C-12`)**.
  No write control.
- **`C-12` Care Activity Timeline** (caregiver) — a single newest-first feed merging two sources:
  **Care changes** (`audit_events`, plain-language rendering) and **Stock movements**
  (`inventory_transactions`, signed delta + `reason`/`adjustment_reason` label). A filter
  (All / Care changes / Stock) plus a date range; the stock side also filters by medicine. Read-only.
- **`E-08` Personal Adherence** (elder) — the elder's own days over the selected range, read-only:
  per-day confirmed/missed and a missed marker; reached from `E-01` Home. No editing control.
- **Family Home `F-03` / `F-10` Care Summary** (family) — the existing summary card gains the
  7/30/90 range selector and is backed by the same RPC (counts only). No new route; the family's only
  report surface.

## Data touched

### Migration `supabase/migrations/20261108120000_sprint9_reports.sql`

**No new tables.** The three history sources already exist with RLS and select grants. Sprint 9 adds
**one read RPC** and **one supporting index**.

**Filename ordering (MF-style note):** the timestamp is a monotonic ordering token (not a calendar
date) and must sort **after** the applied Sprint 8 migration `20261107120000`.

**A. `public.get_adherence_report(p_elder_id uuid, p_from date, p_to date) returns jsonb`**

- `security definer`, `set search_path = public, pg_temp`. **Read-only**: inserts nothing, writes no
  audit row.
- **Guard (the whole authorization boundary, because `security definer` bypasses RLS — MF5):**
  require the caller's own `profiles` row to be active **and** one of
  `public.is_elder_self(p_elder_id)` / `public.is_active_member_of(p_elder_id)`; otherwise
  `raise … using errcode = 'insufficient_privilege'` (`42501`), with **no** distinction between
  "forbidden" and "not found" (MF5/MF6).
- **Bounds (MF4):** reject `p_from`/`p_to` null with `check_violation` (`23514`); require
  `0 <= (p_to - p_from) <= 365`, i.e. **1–366 inclusive dates**; mirror `maxReportRangeDays = 366` in
  the shared schema.
- **Bucketing (MF7):** group by the immutable `dose_events.scheduled_local_date` (the schedule's local
  calendar date captured at generation — not the device date; if an elder's schedules use different
  zones, each row keeps its own wall-clock date).
- **Body:** `generate_series(p_from, p_to, interval '1 day')` left-joined to an aggregate over
  `dose_events` (`elder_id = p_elder_id`, `scheduled_local_date` in range) grouped per day, producing:
  ```json
  {
    "from": "2026-10-01", "to": "2026-10-07",
    "days": [ { "date": "2026-10-01", "taken": 2, "missed": 0, "open": 0,
                "settled": 2, "expected": 2 }, … ],
    "totals": { "taken": 9, "missed": 2, "open": 1, "settled": 11, "expected": 12, "percent": 82 }
  }
  ```
  - `taken` = rows with `taken_at` not null; `missed` = rows with `missed_at` not null;
    `open` = rows with neither (upcoming/due) — **missing is only ever the persisted `missed_at`
    fact, never derived from the clock** (MF17 note).
  - `settled = taken + missed`; `expected = settled + open`.
  - `percent = round(100.0 * taken::numeric / nullif(settled, 0))::int`, `0` when `settled = 0`
    (numeric cast first — MF3). Days with no occurrences are present with zeros (a continuous series).
- **Cancellation precedence (MF8):** rows with `cancelled_at` not null are **excluded entirely from
  every count** (cancellation wins); a row that has both a terminal fact and `cancelled_at` is hidden,
  which is the defined precedence. A test covers cancelled+taken and cancelled+missed.
- **Grants (MF13):** `revoke all on function public.get_adherence_report(uuid, date, date) from
  public, anon, authenticated;` then `grant execute … to authenticated;`. The pgTAP asserts
  `has_function_privilege` for `anon`, `public` and `authenticated` by **exact signature**.

**B. Supporting index (MF9).** `create index dose_events_by_elder_local_date on public.dose_events
(elder_id, scheduled_local_date);` — supports the report predicate. (The existing
`(elder_id, scheduled_at)` index is not addressed by this filter.)

**C. No other schema change.** The activity timeline is direct, RLS-scoped selects on `audit_events`
and `inventory_transactions`; `E-08` reuses the `dose_events` read policy.

### Mobile

- **`db/reports.ts`** — `getAdherenceReport(elderId, from, to): Promise<AdherenceReport>`; calls the
  RPC and validates the payload against the shared schema; also exports the report date-range helper
  (`reportRangeBounds(days, now)` → `{ from, to }` as `YYYY-MM-DD`, never constructing a `Date` from a
  stored local date — MF non-blocking).
- **`db/activity.ts`** — the timeline: `listCareActivity(elderId, { kind, from, to, medicationId?,
  limit })` returns a merged, deterministically ordered (`at DESC, id DESC`) list of
  `{ id, kind: 'audit' | 'stock', label, detail, at }`:
  - audit side selects `id, action, target_table, target_id, created_at, before_summary, after_summary`
    and maps via the shared presenter (never raw ids/JSON);
  - stock side selects `inventory_transactions` with `batch:medicine_batches(id, lot_number,
    medications(id, name))`, applies a server-side `created_at` range and a bounded `limit` (MF11),
    and maps `delta`, `reason`, `adjustment_reason`, `note`, `created_at`.
- **`reports.tsx` (`C-09`)** — range selector, rate, per-day trend, missed list, and a button to
  `/caregiver/activity`.
- **`(caregiver)/caregiver/activity.tsx` (`C-12`)** — registered `href: null`; the filter + timeline.
- **`(elder)/elder/adherence.tsx` (`E-08`)** — registered `href: null`; reached from `index.tsx`.
- **Family `index.tsx`** — the summary card gains the range selector and uses the RPC (counts only).
- **Retrieval filters (OD4):** medicine/kind/date filters are applied client-side over the
  server-bounded rows; a note states the filter is presentation-only and RLS plus the server range are
  the real boundary.

### Screen state matrix (MF16)

Each new/extended screen defines: **loading**, **success with records**, **success with no records**
(`EmptyState`), **no linked elder/circle**, **unauthorized/stale target** (`ScreenError` + safe return),
**payload/validation failure** (`ScreenError`), and **pull-to-refresh**. The family screen
distinguishes "no active circle" from "an empty report".

### Shared package

- **`packages/shared/src/report.ts`** (new): `adherenceReportSchema` (zod, mirroring the RPC payload
  exactly, including the integer `percent` and the day series), `reportRangeSchema` (`7 | 30 | 90`),
  `reportRangeOptions`, `defaultReportRangeDays = 7`, `maxReportRangeDays = 366`, and
  `reportRangeBounds`. Unit tests for the schema, the bounds arithmetic, and a non-integral rate
  (2/3 → 67).
- **`packages/shared/src/audit.ts`** (new): `auditActionLabel(action)` — a **closed** map for the
  actions the app emits today plus a bounded fallback: only an action matching `^[a-z0-9_]+$` is
  humanised, otherwise the label is the fixed string `"Care record updated"`; the result is never
  empty and never contains an id or raw JSON. `describeAuditEvent(row)` returns a short line from a
  small **type-checked** allowlist (`name`, `state`, `status`, `reason`, `quantity`): string/number
  values only, each truncated to 80 chars, objects/arrays/null ignored (MF14). Unit tests cover
  malformed shapes, nested values, nulls, over-long strings, and unknown actions.
- **`packages/shared/src/inventory.ts`** (extend): export the `reason`/`adjustment_reason` labels used
  by the Sprint 5 editor so the history and the editor share one map (OD6/MF10).
- Reuse `status-presentation.ts` for the missed marker (`doseStatusPresentation.missed`) so
  tone → colour stays in one place; `status.test.ts` already asserts every enum has a presentation.

## Acceptance criteria

### Provable in the single-session pgTAP suite

1. **Authorization (MF5).** `get_adherence_report` succeeds for the elder self, the manager and an
   **active** family member; it raises `42501` for an unrelated account, for a manager of a
   **different** elder, for an elder naming a **different** elder, and for a nonexistent elder id —
   with no distinction between forbidden and missing, and writing nothing.
2. **Deactivated caller (MF6).** A caller whose `profiles.deactivated_at` is set is refused.
3. **Bounds (MF4).** A null date, `p_from > p_to`, and a span greater than 366 inclusive dates raise
   `23514`; the `0`- and `365`-difference boundaries are accepted.
4. **Aggregation (MF2/MF3/MF17).** With fixtures across known local dates — a taken row, a missed row,
   an **open** row, two occurrences on one date, and a non-integral rate — the RPC returns the correct
   per-day `taken`/`missed`/`open`/`settled`/`expected` and integer `percent`; a day inside the range
   with no rows is present with zeros; days outside the range are absent.
5. **Cancellation (MF8).** A `cancelled_at` row is excluded from every count, including a
   cancelled+taken and a cancelled+missed row; cancellation precedence is as specified.
6. **Bucket key (MF7).** A schedule whose stored timezone differs from the test session's zone is
   bucketed by its own `scheduled_local_date`, not by device arithmetic.
7. **No leak.** The report never returns another elder's counts.
8. **Grants (MF13).** `has_function_privilege` is false for `anon` and `public` and true for
   `authenticated`, by exact signature.
9. **RLS reads (regression).** `audit_events` returns the manager's linked rows and **zero** to an
   active family member; `inventory_transactions` and `dose_events` return rows to the manager and the
   elder (and, where the policy admits it, the active family member) and zero to an unrelated account;
   direct insert/update/delete by any client role remains `42501`. (The elder's own-row audit read is
   asserted as the **current** documented behaviour of OD8, whichever way the owner decides — MF18.)
10. **Shared unit tests** for `adherenceReportSchema`/`reportRangeBounds`, `auditActionLabel`/
    `describeAuditEvent`, and the inventory reason labels.
11. **Regression gate (MF20).** The migration and every client increment leave the existing
    **550** pgTAP assertions and `pnpm typecheck`/`lint`/`test`/`format:check` green; nothing may
    regress the medication transaction path.

### Requires separate evidence (not claimed as single-session pgTAP)

- **Mobile/device:** `C-09`/`C-12`, `E-08`, the family Home range; the range selector; the plain
  audit rendering; the kind/medicine/date filters; role visibility (family sees the summary only);
  accessibility (48 dp targets), light/dark contrast, and no status by colour alone
  (`pnpm check:contrast`).
- **Thesis:** a screenshot set per screen and a step → expected → observed table.

## Out of scope

- AI/OCR, prescription evidence, embeddings and semantic search (removed 2026-10-05). Prescriptions are
  not in the app, so "find in my prescriptions" is not built.
- PDF/CSV export, share sheets, printing (OD5).
- Custom arbitrary ranges and saved filters (OD1).
- Server-side full-text search (OD4).
- Any write: reports/history are strictly read-only; corrections remain the Sprint 4/5 guarded RPCs.
- New frame IDs; the catalogue is fixed (`C-09`, `C-12`, `E-08`, `F-10` only).

## Risks

- **Scope vs the checking.** The 2026-10-15/16 checking demos the medication cycle; Sprint 9 must not
  destabilise it (regression gate, criterion 11). **Build order:** (1) migration + RPC + index + pgTAP;
  (2) shared schemas + presenters; (3) `C-09` range; (4) `C-12` timeline; (5) `E-08`; (6) family Home
  range. If time compresses, `E-08` and the family Home range slip first; the RPC, `C-09` and `C-12`
  are the protected core.
- **Aggregation drift.** The RPC (authoritative for `C-09`/family) buckets by `scheduled_local_date`
  and counts only persisted facts; the client `summarise` buckets by device time and derives `due` from
  the clock. Keep `summarise` for the live Home cards; do not reuse it for the report.
- **Audit JSON is free-form.** The presenter must type-check, truncate, and never emit ids/JSON; it
  must not fail on an unexpected shape (MF14).
- **Family over-exposure.** Counts-only is enforced by the RPC payload shape, and the family reads no
  `audit_events` (MF12).
- **Audit boundary (OD8).** The elder can currently read their own elder-scoped audit rows at the DB
  level; Sprint 9 adds no UI for it. Do not claim manager-only at the DB layer unless OD8 tightens it.

## Verification checklist (on approval, before merge)

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, `pnpm check:contrast`;
  `npx supabase db reset` + `npx supabase test db` (the suite grows from **550**).
- A non-mutating hosted smoke after the push: `get_adherence_report` succeeds for the caregiver and
  raises `42501` for an unrelated account; the family reads zero `audit_events`; `migration list
  --linked` shows all migrations in sync. Fresh `db dump` before the push.
- A plain-English summary for the owner before merge.
