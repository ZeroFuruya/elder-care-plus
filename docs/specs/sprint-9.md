# Sprint 9 — Reports, history and retrieval

- **Status:** **Draft v1 (2026-10-06) — awaiting owner approval. No implementation before approval.**
  Drafted by request (the owner chose **full reports/retrieval**). The next workflow step is a
  `@architect` critique (manual, analyze-only; **requires explicit owner approval to invoke**), then
  owner sign-off, then an implementation branch.
- **Flow:** `docs/00-product-flow.md` §2 (capability table — reports are role-scoped), §5 (caregiver
  **reports** screen; elder **history**), §6 (`dose_events`, `inventory_transactions`, `audit_events`),
  §7 (`notifications`/`pgvector` note), §8 (never hard-delete history). `docs/02-ui-ux-standard.md`
  §6 (status never by colour alone), §8 (frames), §12 (destructive confirmation), §13 (minimal text).
- **Depends on:** Sprint 1 (`audit_events` + its select policy + `is_manager_of`/`is_active_member_of`/
  `can_view_profile`), Sprint 3 (`medications`, `medication_schedules`), Sprint 4 (`dose_events` with
  `scheduled_local_date`, `inventory_transactions`, `confirm_dose`), Sprint 5 (`adjustment_reason`,
  inventory history), Sprint 7 (`assert_valid_timezone`), Sprint 8 (family shell, `can_view_profile`
  already admits active family members).
- **Supersedes:** the stub caregiver **Reports** screen (`reports.tsx`, 7-day client-only summary) and
  the "reports/retrieval" stretch item in `AGENTS.md`'s scope priority. It adds the audit-trail and
  stock-history views the capability table already promises the caregiver.
- **Removals already binding (2026-10-05):** AI/OCR and prescription evidence are cut from the app,
  so **prescriptions are out of scope** and "retrieval" here means **filtered browsing of retained
  records — never embeddings or semantic search**. `pgvector`/`document_chunks` are not used.

## Owner decisions (proposed — confirm or change at approval)

- **OD1 — report ranges.** Fixed options **7 / 30 / 90 days** (no custom date picker), default **7**.
  The report is anchored to the elder's local dates already stored on each dose
  (`dose_events.scheduled_local_date`), so it is timezone-correct without client date arithmetic.
- **OD2 — family access (capability table §2).** The connected family member sees the **adherence
  summary only** — counts and a confirmation rate — with **no** per-dose medical detail beyond what
  the family Home already shows, and **no** audit trail and **no** stock-adjustment history. Reached
  from the family `More` tab. The server RPC returns counts only, so this is enforced, not just hidden.
- **OD3 — audit trail audience.** The **caregiver manager only** (RLS already scopes `audit_events`
  to the actor, the elder self, or the manager; the family receives zero rows). The UI renders a
  **plain-language line** per event — never raw JSON. The elder's `my history` is dose activity, not
  the audit trail.
- **OD4 — "retrieval".** Client-side, read-only **filtering** over the RLS-scoped rows: a date range
  plus a medicine filter on dose/stock history, and a text filter over medicine names. **No**
  server-side full-text search and **no** embeddings (AI removed 2026-10-05).
- **OD5 — export/share.** **Out of scope.** No PDF/CSV export, no share sheet, no print. Reports are
  read on screen (and captured as screenshots for the thesis).
- **OD6 — stock reasons.** The stock history reuses Sprint 5's vocabulary
  (`dose_confirmed`, `restock`, `correction`, `damage`, `waste`, `count_adjustment`) and its labels;
  the automatic dose decrement stays visually distinct from a manual adjustment.
- **OD7 — no new native dependency.** Every screen is a read over existing tables, so Sprint 9 adds
  no native module and does **not** by itself force an APK rebuild (Sprint 8's
  `expo-calendar`/`expo-notifications` rebuild already covers the demo).

## Goal

Give each role a faithful, read-only view of retained history at its authority level: a
server-aggregated **adherence report** over a selectable range; a caregiver **activity/audit trail**;
a caregiver **stock history**; the elder's **personal daily history**; and a family **adherence
summary**. Retrieval means filtered browsing of records that already exist. Nothing is written, nothing
is deleted, and no view ever suggests a medicine change or clinical advice.

## User stories

1. As a caregiver manager, I can open Reports and see the confirmation rate and the day-by-day trend
   for the last 7, 30 or 90 days, and the days that carry a missed dose stand out with text + icon,
   not colour alone.
2. As a caregiver manager, I can open Activity and see a plain-language, newest-first trail of the
   audited changes to the elder's care (who, what, when), read-only.
3. As a caregiver manager, I can open Stock history and see every stock movement for the elder's
   medicines — the automatic dose decrement and each manual adjustment with its reason — filtered by
   medicine and by date.
4. As an older adult, I can open My history and see my own recent days, read-only: how many doses were
   due and confirmed, and which were missed, without any editing control.
5. As a connected family member, I can see the adherence summary for the last 7/30/90 days (counts
   only) and nothing more.
6. As an unrelated account, I can read nothing on any of these screens.

## Screens

Frame IDs are proposed (`docs/02-ui-ux-standard.md` §8.4); confirm against the wireframes during
critique. Every screen reuses existing components (`Screen`, `Card`, `DetailRow`, `StatusPill`,
`ChoiceChips`, `EmptyState`, `ScreenError`) and stays light/dark compatible with 48 dp targets.

- **`C-09` Reports** (caregiver) — extends the current `reports.tsx`. A range selector
  (7 / 30 / 90 days, `ChoiceChips`), the overall confirmation rate, a compact per-day trend
  (counts + a missed marker), the missed-dose list, and two entry points: **Activity (C-10)** and
  **Stock history (C-11)**. No write control anywhere.
- **`C-10` Activity / audit trail** (caregiver) — read-only `audit_events` for the linked elder,
  newest first, grouped by day; each row shows a plain-language action, the target, and the local
  time. Rendered from a shared presenter, never raw JSON.
- **`C-11` Stock history** (caregiver) — read-only `inventory_transactions` for the elder, newest
  first; each row shows the medicine, the signed delta + unit, the reason label, the note, and the
  time. Filter by medicine (client-side) and by range.
- **`E-13` My history** (elder) — the elder's own days over the selected range, read-only: per-day
  due/confirmed and any missed marker; reached from `E-01` Home (or the Meds tab). No editing.
- **`F-16` Adherence** (family) — the adherence summary only (counts + rate) over 7/30/90 days,
  reached from the family `More` tab. No dose detail beyond the existing Home, no audit, no stock.

## Data touched

### Migration `supabase/migrations/20261108120000_sprint9_reports.sql`

**No new tables.** The three history sources already exist with RLS and select grants:
`dose_events` (`can_view_profile(elder_id)` — elder, manager, active family),
`inventory_transactions` (`can_view_profile(batch_elder_id(batch_id))`),
`audit_events` (actor, the elder self, or `is_manager_of(elder_id)` — family excluded). Sprint 9 adds
**one read RPC** and nothing else.

**Filename ordering:** the timestamp is a monotonic ordering token (not a calendar date) and must sort
**after** the applied Sprint 8 migration `20261107120000`, following the repo convention (MF-style note
echoed from Sprint 7).

**A. `public.get_adherence_report(p_elder_id uuid, p_from date, p_to date) returns jsonb`**

- `security definer`, `set search_path = public, pg_temp`. **Read-only**: it inserts nothing and writes
  no audit row.
- **Guard:** `if not (public.is_elder_self(p_elder_id) or public.is_active_member_of(p_elder_id))`
  then `raise exception … using errcode = 'insufficient_privilege'` (so a manager, an active family
  member, and the elder self can call it; an unrelated account cannot).
- **Bounds:** `p_from <= p_to` and the span `<= 366 days`, else `check_violation` (mirrored in the
  shared schema). No timezone parameter is needed: it buckets on the stored `scheduled_local_date`,
  which is already the elder's local date and is immune to the Hermes IANA issue that Sprint 7 worked
  around.
- **Body:** a `generate_series(p_from, p_to, interval '1 day')` left-joined to an aggregate of
  `dose_events` (`elder_id = p_elder_id`, `cancelled_at is null`, `scheduled_local_date` in range),
  grouping per day and counting `taken_at is not null` as taken and `missed_at is not null` as missed.
  Returns:
  ```json
  {
    "from": "2026-10-01", "to": "2026-10-07",
    "days": [ { "date": "2026-10-01", "taken": 2, "missed": 0, "total": 2 }, … ],
    "totals": { "taken": 9, "missed": 2, "total": 11, "percent": 82 }
  }
  ```
  Days with no occurrences are present with zeros (a continuous series, so the trend has no gaps).
  `percent` is `round(100 * taken / nullif(taken + missed, 0))`, `0` when the denominator is `0`.
- **`cancelled_at`** occurrences are excluded from every count (a cancelled occurrence is neither
  taken nor missed).
- **Grants:** `revoke all … from public, anon;` then `grant execute … to authenticated;`. The pgTAP
  suite asserts `has_function_privilege('anon', …, 'execute')` is false.

### No other schema change

- The audit trail is a direct, RLS-scoped `select` on `audit_events` (already granted to
  `authenticated`); no new policy or RPC.
- Stock history is a direct, RLS-scoped `select` on `inventory_transactions` with an embedded join to
  `medicine_batches` → `medications` for the medicine name; no new policy.
- Elder history reuses the existing `dose_events` read policy.

### Mobile

- **`db/reports.ts`** — `getAdherenceReport(elderId, from, to): Promise<AdherenceReport>`, calling the
  RPC and validating the payload against the shared schema.
- **`db/audit.ts`** — `listAuditEvents(elderId, limit)`; selects
  `id, action, target_table, target_id, created_at, before_summary, after_summary` and maps each row to
  a `{ id, label, detail, targetLabel, createdAt }` via the shared presenter.
- **`db/inventory-history.ts`** — `listInventoryHistory(elderId, { medicationId?, limit })`; selects
  `inventory_transactions` with `batch:medicine_batches(id, lot_number, medications(id, name))` so a
  medicine filter and a medicine label are available; maps `delta`, `reason`, `adjustment_reason`,
  `note`, `created_at`.
- **Screens/routes:** caregiver `activity.tsx` (`C-10`) and `stock-history.tsx` (`C-11`) registered
  `href: null`, reached from `reports.tsx` (`C-09`); elder `history.tsx` (`E-13`) registered
  `href: null`, reached from `index.tsx`; family `reports.tsx` (`F-16`) registered `href: null`,
  reached from `more.tsx`. `reports.tsx` gains the range selector and the two entry buttons.
- **Retrieval filters (OD4):** the stock-history medicine filter and the medicine-name text filter are
  applied client-side over the RLS-scoped rows; a note states the filter is presentation-only and RLS
  is the real boundary.
- **Empty/error states:** reuse `EmptyState` (no history yet) and `ScreenError` (load failed), so a
  stale or unauthorized target never crashes.

### Shared package

- **`packages/shared/src/report.ts`** (new): `adherenceReportSchema` (zod, mirroring the RPC payload
  exactly), `reportRangeSchema` (`7 | 30 | 90`), `reportRangeOptions`, `defaultReportRangeDays = 7`,
  and `maxReportRangeDays = 366`; a unit test for the schema and the range arithmetic.
- **`packages/shared/src/audit.ts`** (new): `auditActionLabel(action)` — a map for the actions the app
  emits today, with a humanising fallback (`'dose_confirmed' → 'Dose confirmed'`) that is **never**
  empty, and `describeAuditEvent(row)` returning a short plain-language line from a small allowlisted
  set of `after_summary` keys (`name`, `state`, `status`, `reason`, `quantity`), ignoring the rest.
  Unit tests assert the fallback and that no known action yields an empty label.
- **`packages/shared/src/inventory.ts`** (extend): export the adjustment-reason labels already used by
  the Sprint 5 stock editor so the history and the editor never diverge.
- Reuse `status-presentation.ts` for the report's missed marker (`doseStatusPresentation.missed`) so
  tone → colour stays in one place; `status.test.ts` already asserts every enum has a presentation.

## Acceptance criteria

### Provable in the single-session pgTAP suite

1. **Authorization.** `get_adherence_report` succeeds for the elder self, the caregiver manager and
   an **active** family member, and raises `42501` for an unrelated account and for a manager of a
   different elder, writing nothing.
2. **Bounds.** `p_from > p_to` and a span greater than 366 days raise `23514`.
3. **Aggregation.** With fixture dose events across known local dates — including one taken, one
   missed, and one `cancelled_at` row — the RPC returns the correct per-day `taken`/`missed`/`total`,
   **excludes** the cancelled occurrence, and computes `percent` correctly; a day inside the range
   with no occurrences is present with zeros; a day outside the range is absent.
4. **No leak.** The RPC never returns another elder's counts (its guard is the only path).
5. **Grants.** `has_function_privilege('anon', 'public.get_adherence_report(uuid,date,date)',
   'execute')` is false and the same for `authenticated` is true.
6. **RLS reads (regression).** `audit_events` returns rows to the manager and the elder self and
   **zero** to an active family member; `inventory_transactions` and `dose_events` return rows to the
   manager, the elder and the active family member and zero to an unrelated account; direct
   insert/update/delete by any client role remains `42501`.
7. **Shared unit tests** for `adherenceReportSchema`, `auditActionLabel`/`describeAuditEvent`, and the
   reason-label reuse.

### Requires separate evidence (not claimed as single-session pgTAP)

- **Mobile/device:** `C-09`/`C-10`/`C-11`, `E-13`, `F-16`; the range selector; the plain-language
  audit rendering; the medicine/date filters; role-specific visibility (family sees the summary only);
  accessibility (48 dp targets), light/dark contrast, and no status conveyed by colour alone.
- **Thesis:** a screenshot set per screen and a step → expected → observed table, as for the Sprint 4
  transaction cycle.

## Out of scope

- AI/OCR, prescription evidence, embeddings and semantic search (removed 2026-10-05). Prescriptions
  are not part of the app, so "find in my prescriptions" is not built.
- PDF/CSV export, share sheets and printing (OD5).
- Custom arbitrary date ranges and saved report filters (OD1).
- Server-side full-text search (OD4).
- Any write: reports/history are strictly read-only; corrections remain the Sprint 4/5 guarded RPCs.
- Appointment history polish beyond the Sprint 7 `E-12`/`C-06` tabs.

## Risks

- **Scope vs the checking.** The 2026-10-15/16 checking demos the medication cycle; Sprint 9 must not
  destabilise it. **Build order:** (1) migration + RPC + pgTAP; (2) shared schemas + presenters;
  (3) caregiver `C-09` range + `C-10` activity; (4) `C-11` stock history; (5) `E-13`; (6) `F-16`.
  If time compresses, `C-11`, `E-13` and `F-16` are the first to slip — the RPC, the audit trail and
  the reports range are the protected core.
- **Aggregation drift.** Two aggregation paths (the client `summarise` and the RPC) could disagree.
  The RPC is authoritative for `C-09`/`F-16`; keep `summarise` for the live Home cards and note that
  it buckets by device time while the RPC buckets by `scheduled_local_date`.
- **Audit JSON is free-form.** `before_summary`/`after_summary` have no fixed shape; the presenter must
  render a safe allowlist and never dump raw JSON to a non-technical user, and must not fail on an
  unexpected shape.
- **Family over-exposure.** The capability table says "adherence summary only"; the screen and the RPC
  both enforce counts-only, and the pgTAP proves the family gets no `audit_events`.
- **Large histories.** A 90-day range can be many rows; every list is **bounded** (a `limit` and a
  range) and filtered client-side, and the RPC aggregates server-side so the report never downloads
  every dose row.

## Verification checklist (on approval, before merge)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (shared + audit presenter), `pnpm format:check`,
  `pnpm check:contrast`; `npx supabase db reset` + `npx supabase test db` (the suite grows from
  **550** by the Sprint 9 assertions).
- A non-mutating hosted smoke after the migration push: `get_adherence_report` succeeds for the
  caregiver and **raises `42501`** for an unrelated account; the family read of `audit_events` returns
  `[]`; `migration list --linked` shows all migrations in sync. Fresh `db dump` before the push.
- A plain-English summary for the owner before merge.
