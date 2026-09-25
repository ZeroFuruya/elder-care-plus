# ElderCare+ — Dev Environment & Setup Reference (for AI agents)

> **Audience:** AI coding agents and chat assistants helping build ElderCare+. The human owner is the student developer.
> **Snapshot:** 2026-09-23. Prices, free-tier limits and model names change often. Items marked **[verify]** were not confirmed. Items marked **[assumed]** are placeholders the owner hasn't fixed yet.
> **Product source of truth:** `docs/00-product-flow.md` (the v1.1 AI Product Flow and Build Brief).
> **This file is the source of truth for tooling, environment and workflow decisions.** If the two files conflict on product scope, the product-flow doc wins. On tooling, this file wins.

---

## 1. How to use this file (instructions to the AI)

1. Read `docs/00-product-flow.md` and this file before doing feature or setup work.
2. Treat the choices in Section 4 as **decided**. If you think one is wrong, say so with reasons and a cost estimate, then wait for the owner's approval. Do not silently swap tools.
3. **Budget is tight.** Do not suggest or introduce a paid service, plan, or upgrade without stating the cost and getting approval. Prefer free tiers and open-source tools.
4. Do not add dependencies without asking, with a one-line reason.
5. The owner must be able to **explain and defend** everything at the thesis defense. Explain your changes in plain English: what changed, which files, how to test it, what you're unsure about.
6. If the request is ambiguous, especially about schema, security or privacy, ask instead of guessing.
7. **Never fabricate** citations, benchmark numbers, survey results, test results, metrics, or quotes. If you don't know, say so.
8. Never ask for, print, store or paste secrets (API keys, service-role key, tokens). **Never send real health data — real names, conditions, allergies, medications, photos of real prescriptions — to any third-party AI or free-tier API, including the models in Section 4.** Use synthetic elder/caregiver fixtures for every dev, test, and AI-review session.
9. If you change a decision in this file, update the file and add a line to the changelog (Section 16).

---

## 2. Product in brief

**ElderCare+** is a family-centered care-coordination and record-keeping app for older adults. It is **not** a diagnostic, prescribing, drug-interaction-checking, emergency-dispatch, or pharmacy-ordering service — that boundary governs every feature.

- A **family caregiver** manages the elder's medication plan, inventory/expiry, prescriptions, appointments and emergency info.
- The **elder** views their plan and confirms their own doses; nothing else. One active caregiver-to-one-elder link per release.
- The core mechanic is a **confirmation loop**: elder marks a dose taken → caregiver is notified → an escalation fires if the dose is missed past its grace period. This loop is the product's main differentiator.
- OCR/AI on prescription photos is **reference-only** — it can never auto-create or auto-fill a medicine, schedule, dose, or clinical advice. The caregiver manually reviews and enters every field.
- History is **never hard-deleted** — deactivate or archive with timestamps instead. Confirmed doses, stock adjustments, prescription verifications and past appointment states all require confirmation and produce an audit event.

**Hard product rules (from the product-flow doc):**
- Never suggest a substitute medicine, change a dose, or tell the elder to stop treatment. Unclear, expired or inconsistent medicine info always routes to the caregiver or a qualified professional, never to an AI-generated answer.
- Status (stock, expiry) is never color-only — pair it with text/icons.
- Elder-submitted prescription photos stay `pending_review` until the caregiver verifies them.
- Consent, unlink, account deletion and evidence-access changes require re-authentication.
- Notification text stays minimal on lock screens; full medical detail appears only after authenticated in-app navigation.
- Offline dose confirmations queue visibly and must never duplicate a dose event or stock decrement on retry (idempotency, not just "eventually consistent").

---

## 3. Constraints

| Area | Constraint |
|---|---|
| Budget | Tight. Free tiers first. Recurring cash cost: token spend on the model roster in Section 4. |
| Dev machine | Windows PC. Ryzen 5 5600G, 32 GB DDR4, NVIDIA RTX 5050 (8 GB VRAM). RTX 50-series needs a PyTorch build with CUDA 12.8+. |
| Local AI | 8 GB VRAM: fine for OCR and small models. Not for a local coding agent. |
| Region | Philippines (UTC+8). Philippine Data Privacy Act applies, and this app handles **health data**, a sensitive category under it — treat every real record as regulated, not just as PII. |
| Data | Synthetic elder/caregiver fixtures only, in dev, in tests, and in anything pasted to an AI tool, until the adviser approves a real-data handling plan. |
| Academic | Owner must comply with the school's and adviser's rules on AI-assisted work. Keep an AI-use log. |
| Timeline | **[assumed]** No fixed Gantt has been confirmed for ElderCare+ yet — Section 11 gives a sprint order, not fixed weeks. Confirm against the owner's actual academic schedule. |

---

## 4. Decided stack (change only with owner approval)

### 4.1 AI model roster

| Model | Role | Notes |
|---|---|---|
| **DeepSeek V4.1 Flash** | Main coder — does the actual implementation | Default agent in OpenCode. Direct DeepSeek billing (not OpenRouter), since this is the highest-volume spend and avoids a routing fee on it. |
| **Gemini 3.8 Flash** | Fast independent coder / multimodal / second opinion | Different lineage from DeepSeek — useful for catching blind spots DeepSeek shares with itself. Via OpenRouter. |
| **GPT-5.6 Luna** | Cheap reasoning / second opinion, architecture and debugging | Same tier as free ChatGPT's Think mode, but wired into OpenCode via OpenRouter so it can read the repo instead of being pasted into. |
| **Grok 4.6** | Strong independent reviewer / adversarial review | Genuinely separate vendor (xAI). Used for "try to break this" passes. |
| **Claude Opus 5** | Rare hardest problems — final escalation | Most expensive by far ($5/$25 per million tokens). Use sparingly, only when a bug survives two other models. |

**Routing discipline:** DeepSeek Flash should do the large majority of work. The other four are summoned deliberately, not automatically — see Section 10.

### 4.2 Everything else

| Layer | Choice | Notes |
|---|---|---|
| Agent tool | OpenCode | Reads `AGENTS.md`. Config in `opencode.json` (Section 7). |
| Autocomplete | GitHub Copilot Student | Autocomplete only. **[verify]** it is active on the owner's account. |
| Client | React Native + Expo, TypeScript, Expo Router | **Mobile-only.** Both caregiver and elder use the same app with role-specific tab sets — there is no separate moderator/admin web app for this product. Free EAS plan: 15 Android + 15 iOS builds per month. |
| Backend | Supabase Free: Postgres, Auth, Storage, RLS, Realtime/Edge Functions, pgvector | Region: Singapore. |
| AI service | FastAPI in a Hugging Face Space (Docker SDK, free CPU) | Port 7860. Lighter footprint than a photo-matching product: **OCR and text embeddings only**, no image-similarity model. |
| Prescription OCR | PaddleOCR (standard model first); RapidOCR-ONNX fallback | Extracts text from a prescription photo for the caregiver to reference. Never auto-fills a field. |
| Text embeddings | Qwen3-Embedding (0.6B first) | Embeds only **caregiver-approved** extracted prescription text/chunks, for the private "find in my prescriptions" retrieval in `document_chunks`. Raw unreviewed OCR text is never embedded. |
| Local dev/offline | Expo SQLite (local queue) | Backs the offline dose-confirmation queue. |
| Non-AI toolkit | VS Code, Git/GitHub, Node LTS, pnpm (corepack), Docker Desktop, Supabase CLI, Python 3.12 + uv, Bruno, ESLint, Prettier, Vitest, GitHub Actions | |
| Paper tools | Zotero, draw.io + Mermaid, Google Stitch then Figma, Google Forms/Sheets, Jamovi or JASP, NotebookLM, Semantic Scholar, Scite | Same set as the owner's other thesis app — no product-specific change needed here. |

---

## 5. Architecture

```
[Expo mobile app: caregiver + elder roles] ──► Supabase (Auth, Postgres+RLS, Storage,
                                                 Realtime, pgvector, RPC/Edge Functions)
                                                         │
                                                         ▼
                                    [FastAPI AI service on HF Space]
                                    /ocr   /embed/text   /health
```

No web client, no moderator role — this product only has the two roles in Section 2. Clients talk to Supabase with the **anon key + user JWT**; RLS is the security boundary. The AI service is called by trusted server-side logic (Edge Function or backend job) using a shared-secret header and never holds user data. Embeddings for `document_chunks` are written only after the caregiver has approved the extracted text, not automatically at OCR time.

---

## 6. Repo layout and conventions

```
eldercare-plus/
├─ apps/mobile/        Expo (TypeScript, Expo Router; (auth), (caregiver), (elder) route groups)
├─ services/ai/        FastAPI: OCR + text embeddings
├─ packages/shared/    shared types + zod schemas
├─ supabase/           config.toml, migrations, seed.sql
├─ docs/
│  ├─ 00-product-flow.md      canonical product flow (this repo's source of truth)
│  ├─ 01-dev-environment.md   this file
│  ├─ specs/           one spec per sprint (sprint-N.md)
│  ├─ adr/             decision log, written by the owner
│  ├─ diagrams/        Mermaid / draw.io sources
│  └─ thesis/          chapter drafts, evaluation data
├─ AGENTS.md
├─ opencode.json
└─ .github/workflows/
```

- pnpm. TypeScript strict. Small functions, clear names, no dead code.
- One feature per branch: `sprint-N-short-name`. Small commits with meaningful messages.
- Env vars live in git-ignored `.env*` files. Only public values may use the `EXPO_PUBLIC_` prefix.

---

## 7. Environment reference

**Installed and verified on the owner's machine (Windows), 2026-09-24:** Git, VS Code, Node LTS, pnpm (now enabled via `corepack enable`; shims in `C:\Program Files\nodejs`, v12.5.1), uv (the project's Python is pinned to 3.12 by `services/ai/.python-version` — there is **no system Python 3.12**, `python` resolves only to the Microsoft Store alias), NVIDIA driver, Supabase CLI via `npx supabase`, Expo Go on the phone.

**Not installed** — earlier revisions of this file wrongly claimed these were present. This matters:
- **GitHub CLI (`gh`).** Create and push repositories with plain `git` plus Git Credential Manager (`credential.helper=manager`). Installing `gh` is an owner decision, not a silent setup step.
- **Docker Desktop.** `npx supabase start` cannot run, so migrations can only be *authored*, never applied or tested locally. Required before any Supabase-local work.
- **Bruno.** API testing for `services/ai` uses its own pytest suite (`uv run pytest`) instead.

**`opencode.json`** — DeepSeek direct for the main coder, OpenRouter for the four specialist subagents, each with `edit`/`bash` denied so they can only analyze and report, never modify files:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-v4-flash",
  "provider": {
    "deepseek": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DeepSeek",
      "options": { "baseURL": "https://api.deepseek.com/v1" },
      "models": {
        "deepseek-v4-flash": { "name": "DeepSeek V4 Flash" }
      }
    },
    "openrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenRouter",
      "options": { "baseURL": "https://openrouter.ai/api/v1" },
      "models": {
        "openai/gpt-5.6-luna": { "name": "GPT-5.6 Luna (architect)" },
        "google/gemini-3.8-flash": { "name": "Gemini 3.8 Flash (independent reviewer)" },
        "x-ai/grok-4.6": { "name": "Grok 4.6 (challenger)" },
        "anthropic/claude-opus-5": { "name": "Claude Opus 5 (final review)" }
      }
    }
  },
  "agent": {
    "architect": {
      "description": "Analyzes architecture, difficult bugs, and implementation strategy without modifying files.",
      "mode": "subagent",
      "model": "openrouter/openai/gpt-5.6-luna",
      "permission": { "edit": "deny", "bash": "deny" },
      "prompt": "Act as the architecture and reasoning specialist. Inspect the repository and AGENTS.md before answering. Never use or request real health data \u2014 assume every fixture is synthetic. Do not modify files.\n\nFor the requested problem:\n1. Identify the actual root problem.\n2. Explain the relevant architecture.\n3. Compare viable approaches.\n4. Recommend one approach with tradeoffs.\n5. Give a concrete implementation plan for the primary coding agent.\n\nFocus on correctness rather than writing code."
    },
    "gemini-reviewer": {
      "description": "Provides an independent technical analysis and multimodal perspective.",
      "mode": "subagent",
      "model": "openrouter/google/gemini-3.8-flash",
      "permission": { "edit": "deny", "bash": "deny" },
      "prompt": "Act as an independent technical reviewer. Inspect AGENTS.md, the relevant files, and the current implementation. Never use or request real health data. Do not modify files.\n\nLook specifically for:\n- overlooked edge cases\n- incorrect assumptions\n- integration problems\n- UI/UX issues (accessibility for elderly users matters here)\n- database/API problems\n- alternative implementation approaches\n\nDo not simply agree with the existing implementation. Try to find something the primary agent missed."
    },
    "challenger": {
      "description": "Adversarial reviewer that tries to break the current implementation.",
      "mode": "subagent",
      "model": "openrouter/x-ai/grok-4.6",
      "permission": { "edit": "deny", "bash": "deny" },
      "prompt": "Act as an adversarial software reviewer. Assume the current implementation may contain hidden flaws. Inspect the repository and current changes. Never use or request real health data. Do not edit files.\n\nTry to break the proposed solution. Check especially:\n- offline-sync duplication (a retried dose confirmation or stock decrement must never double-apply)\n- RLS gaps between caregiver and elder access\n- race conditions in the confirmation loop\n- security problems\n- bad assumptions\n- brittle code\n\nReturn concrete findings with file references and suggested fixes."
    },
    "final-reviewer": {
      "description": "High-end final reviewer for difficult or important engineering decisions. Use sparingly.",
      "mode": "subagent",
      "model": "openrouter/anthropic/claude-opus-5",
      "permission": { "edit": "deny", "bash": "deny" },
      "prompt": "Perform a deep final review of the current implementation. Inspect AGENTS.md, the relevant source files, database structure, APIs, tests, and current git diff. Never use or request real health data. Do not modify anything.\n\nDetermine:\n- whether the implementation actually satisfies the requirement\n- likely hidden bugs\n- architectural weaknesses\n- security issues, especially around RLS and the caregiver/elder boundary\n- maintainability problems\n- missing validation\n- missing tests\n\nOnly report substantive findings. Prioritize by severity and explain exactly how to fix each one."
    }
  }
}
```

- Auth: `opencode auth login`, provider `deepseek` for DeepSeek's own key, provider `openrouter` for the OpenRouter key. Restart OpenCode after config edits. Run `/models` after connecting OpenRouter and confirm `google/gemini-3.8-flash` actually resolves — if the slug has changed, swap it in from OpenRouter's own model list.
- Invoke a subagent manually: `@architect`, `@gemini-reviewer`, `@challenger`, `@final-reviewer`. They do not fire automatically.
- **[verify]** whether `#high` / `#max` reasoning variants exist for Luna and Opus on this route before adding them to the model strings — an unrecognized variant errors out.

**Useful commands**

```bash
pnpm install
pnpm --filter mobile start                  # Expo dev server
npx supabase start                          # local stack (Docker)
npx supabase migration new <name>           # new migration
npx supabase db push                        # apply to linked project
npx supabase db dump -f backup.sql          # manual backup
cd services/ai && uv run uvicorn main:app --reload
eas build -p android --profile development  # dev build (counts against free quota)
eas build -p android --profile preview      # installable APK for testers
```

---

## 8. Service rules

### 8.1 Supabase (Free plan)
- Limits: 500 MB DB, 1 GB file storage, two active projects. The project **pauses after about a week idle**. No downloadable backups on Free.
- Keep-alive: a GitHub Actions cron (every ~3 days) hitting the REST endpoint with the anon key.
- **All schema changes via migration files.** Never edit an applied migration or hand-change the production schema.
- **RLS enabled on every table, default deny.** Caregiver accesses only the active linked elder's records. Elder can read only their own linked care records and may change only their own due dose, through a guarded RPC — never a direct table write. Elder-uploaded prescription evidence is insert-only / `pending_review`. Service-role key is server-only, never in mobile, web, or repo.
- Storage: the `prescription-evidence` bucket is **private**; object paths include elder/prescription UUIDs; access only through short-lived signed URLs. No public health-document URLs, ever.
- **Idempotency is a hard requirement, not an optimization.** Dose confirmation, the missed-dose transition, and inventory decrement all need a database-level unique constraint (e.g. one `dose_events` row per schedule occurrence) so a retried offline sync cannot duplicate a `taken_at` timestamp or double-decrement stock.
- `document_chunks`: only store an embedding after the caregiver has approved the extracted text. Retrieval is filtered by the active care link and prescription ID **before** the vector similarity search — never a global search across all users' data.

### 8.2 Prescription OCR and AI boundary (Flow E)
- OCR extracts text from an uploaded photo purely as a **suggestion** the caregiver sees. It never auto-creates or auto-fills a medicine, schedule, dose, or prescription record. The caregiver manually reviews and enters every field before saving.
- Elder-submitted evidence stays `pending_review` until caregiver verification; it is never treated as verified data anywhere else in the app.
- Validate file type/size before upload; reject anything but supported image/PDF MIME types. Strip unnecessary image metadata where feasible.
- `document_chunks` retrieval supports private "find in my prescriptions" lookup only — never diagnosis, drug-interaction analysis, or any autonomous change to a care plan.

### 8.3 AI service
- Endpoints: `GET /health`, `POST /ocr`, `POST /embed/text`. Shared-secret header required. No image-embedding endpoint — this product doesn't need one.
- Never log images, extracted prescription text, or embeddings.
- Hugging Face free CPU Spaces can sleep when idle and reload weights on wake. Callers need timeouts and retries; wake it before demos. **[verify]** current sleep behavior.
- Secrets live in the Space's secret settings, never in the repo.
- Fallback for the defense: run the service on the owner's PC behind a tunnel.

### 8.4 Mobile (Expo)
- Local dose reminders via Expo Notifications; keep lock-screen text minimal (see Section 2), full detail only after authenticated navigation.
- Offline dose confirmations queue through Expo SQLite and show a visible `Pending sync` state; retries must be idempotent (Section 8.1).
- Free EAS quota is small (15 Android + 15 iOS builds/month). Batch native changes; use Expo Go for daily work; build locally if needed.
- Testers install a preview APK. No Play Store account needed unless the panel requires a listing (one-time $25).

---

## 9. Data model (from the product-flow doc — do not redesign without a spec)

`profiles`, `care_links` (one active link per side, hashed single-use 24-hour link code), `elder_profiles`, `emergency_numbers`, `medications`, `medication_schedules`, `medicine_batches` (only one active batch per medicine), `inventory_transactions` (immutable audit trail), `dose_events` (unique per schedule occurrence — the idempotency anchor), `prescriptions`, `prescription_medicines`, `prescription_evidence` (private storage path, checksum, review status), `appointments` (`visit` / `in_home`), `notifications`, `audit_events` (required for status, stock, and care-plan changes), `document_chunks` (caregiver-approved text + embedding vector, optional private retrieval only).

Store quantities as decimals with an explicit unit. Auto-decrement stock only when the batch unit and dose unit match; otherwise require a caregiver adjustment with a reason (which itself creates an audit event). Use UTC timestamps plus the schedule's timezone.

---

## 10. AI-assisted development workflow

**Model routing**

| Task | Use |
|---|---|
| Implementation in small steps | DeepSeek V4.1 Flash |
| Architecture questions, a tricky bug, planning before execution | `@architect` (GPT-5.6 Luna) |
| Independent second opinion, especially UI/accessibility or an alternative approach | `@gemini-reviewer` (Gemini 3.8 Flash) |
| Adversarial pass on a diff — race conditions, RLS gaps, sync duplication | `@challenger` (Grok 4.6) |
| Only after two other models have failed on the same hard problem | `@final-reviewer` (Claude Opus 5) — use sparingly, it's the most expensive model in the roster |
| Autocomplete | Copilot Student |

**Sprint loop**
1. Owner writes `docs/specs/sprint-N.md`: goal, user stories, acceptance criteria, screens, data touched, out-of-scope.
2. `@architect` critiques the spec before implementation starts. Owner decides what to accept.
3. New branch. DeepSeek implements in small chunks.
4. Run typecheck, lint and tests. Owner runs the feature on a phone, with synthetic data only.
5. `@gemini-reviewer` and, for anything touching the confirmation loop, offline sync, or RLS, `@challenger` review the diff.
6. Owner reads the summary and the diff of critical files. If they can't explain it, it goes back.
7. Merge. Owner adds an ADR note in their own words and saves evidence (screenshots, test cases) in `docs/thesis/`.

**Definition of done:** meets the spec's acceptance criteria, passes typecheck/lint/tests, respects Section 2's hard rules and Section 8's service rules, ships any migration and RLS policy together, and comes with a plain-English summary.

---

## 11. Sprint map — **[assumed]**, order derived from the product-flow doc's flows A–G; confirm actual weeks against the owner's Gantt

| Sprint | Focus (flow) | Main tech |
|---|---|---|
| 1 | Accounts, roles, care circle and consent (Flow A) | Supabase Auth, `profiles`, `care_links`, `care_link_invites`, link-code RPC, `audit_events`, RLS |
| 1b | Cut the mobile app over to Supabase Auth + Postgres | `@supabase/supabase-js`, SQLite outbox for offline confirmations, `(family)` route group |
| 2 | Elder profile and emergency info (Flow G) | `elder_profiles`, `emergency_numbers` |
| 3 | Medication and inventory setup (Flow B) | `medications`, `medication_schedules`, `medicine_batches` |
| 4 | Daily medication adherence (Flow C) | `dose_events`, confirmation RPC, notifications, offline queue |
| 5 | Inventory and expiry safety (Flow D) | `inventory_transactions`, alert thresholds, needs-review state |
| 6 | Prescriptions and evidence (Flow E) | `prescriptions`, `prescription_evidence`, OCR service, signed URLs |
| 7 | Appointments (Flow F) | `appointments`, reminders, visit/in_home fields |
| 8 | Family care circle UI (`F-01`…`F-15`) | `(family)` routes, read-only care view, help requests, availability |
| 9 | Reports, audit trail, `document_chunks` retrieval, offline-sync hardening | `audit_events`, embeddings, idempotency tests |

After Sprint 9: integration and security pass, system testing, user evaluation, final deployment — same academic-cycle shape as the owner's other thesis app.

---

## 12. Academic paper support

**Allowed help:** outlining, clarity edits on text the owner wrote, explaining concepts, generating Mermaid/draw.io diagram sources for review, drafting survey and interview instruments, statistics guidance, test-case tables from the owner's specs, code-to-documentation summaries.

**Not allowed:**
- Inventing citations, quotes, statistics, survey responses, participants, interview content, benchmark or evaluation results.
- Writing results the owner hasn't actually measured.
- Presenting AI-suggested references as verified — every reference must be checked by opening the paper or DOI.
- Using any real caregiver/elder health data anywhere in the writing process.

**Conventions**
- References live in Zotero. Writing happens in Word/Google Docs using the school template.
- Data gathering is the owner's job: Google Forms with a consent statement first, responses in Sheets, analysis in Jamovi/JASP. Ask the adviser whether evaluation uses SUS, ISO 25010, or both, and whether a health-app-specific instrument is expected given the domain.
- Evaluation evidence to collect: confirmation-loop success/timing in user tests, offline-sync correctness under retry, OCR usefulness (not accuracy alone — it's reference-only, so "did it save caregiver time" matters more than exact-match rate), SUS or ISO 25010 scores, a system test-case table.
- Keep an **AI-use log** (date, tool, purpose) and follow the school's disclosure rules.

---

## 13. Known limits and gotchas

| Risk | Handling |
|---|---|
| Supabase pauses after inactivity | Keep-alive cron. Verify it runs. |
| 1 GB storage fills up | Compress prescription photos, delete test data. |
| No Supabase backups on Free | Manual `db dump` weekly and before the defense. |
| HF Space sleeps or is slow on CPU | Small models, timeouts/retries, wake before demos, PC-behind-tunnel fallback. |
| EAS free builds run out | Use Expo Go, batch native changes, build locally. |
| Offline sync duplicates a dose or stock change | DB-level unique constraint + idempotency key on the confirmation RPC; adversarial-review this specifically (`@challenger`). |
| DeepSeek slow or erroring at peak | Work off-peak, retry, or use OpenRouter temporarily. |
| Real health data leaking into an AI tool or free tier | Synthetic fixtures only, everywhere, always (Section 1.8). |
| Google/OpenRouter free-tier data use | Free tiers can use traffic to improve products — never send real health data to any free tier. |
| Copilot Student inactive | Small local model via Ollama for autocomplete, or skip. |

---

## 14. Open items to verify

- Whether the owner has a fixed weekly Gantt for ElderCare+, distinct from the sprint order in Section 11.
- Exact current DeepSeek and OpenRouter pricing and peak/off-peak windows.
- OpenRouter balance funding status (a top-up was in progress as of this file's writing).
- Copilot Student status on the owner's account.
- Whether `google/gemini-3.8-flash` is the correct current OpenRouter slug.
- Current free-tier limits for Supabase, Hugging Face Spaces, and EAS.
- Adviser and school rules on AI-assisted development for a health-adjacent app, and on the evaluation instrument.
- Whether the panel expects a caregiver-side web dashboard in addition to the mobile app (the product-flow doc as written is mobile-only).

---

## 15. Status checklist (owner updates)

- [ ] Accounts made, perks claimed, keys in a password manager
- [ ] OpenCode answers with DeepSeek Flash by default; `@architect`, `@gemini-reviewer`, `@challenger`, `@final-reviewer` all resolve
- [ ] Repo scaffolded, `docs/00-product-flow.md` and `AGENTS.md` committed
- [ ] Supabase linked, first migration pushed, keep-alive running
- [ ] Idempotency test written for dose confirmation (offline retry does not duplicate)
- [ ] AI service `/health` reachable from a Hugging Face Space
- [ ] Mobile hello-world on phone reading from Supabase, for both caregiver and elder roles
- [ ] Sprint 1 spec written, first feature reviewed and merged

---

## 16. Changelog

- 2026-09-25: The owner decided all four scope conflicts (`docs/adr/adr-001`…`adr-004`, now Accepted): the product-flow scope wins, and "Connected Family Member" is a third role modelled as care-circle membership on `care_links` (one manager + N view-only family members, elder consent required). Section 11 gained a family-UI sprint (8) and a mobile cutover sprint (1b); reports/audit moved to 9. `docs/00-product-flow.md` §2 now lists three roles. Consequence: the approved system documentation and wireframes must be revised to match.
- 2026-09-24: Corrected §7's installed-tooling list against the actual machine: **GitHub CLI, Docker Desktop and Bruno are not installed**; pnpm is now enabled via `corepack enable` (it previously was not on PATH); Python 3.12 comes from uv, not a system Python. Recorded the consequences for `npx supabase start` and for repo creation. No stack decision changed.
- 2026-09-24: Read the approved `docs/ElderCare_Plus_System_Documentation_and_User_Manual_v1.0.pdf` (28 pages; previously believed to have no extractable text). It is the **approved baseline** and it agrees with the wireframe pack, not with `docs/00-product-flow.md`, on scope: two roles, no prescriptions/OCR, no stock/expiry, one emergency contact. `docs/02-ui-ux-standard.md` §5/§20 were updated with its palette, contrast math and evidence; scope decision briefs were added as `docs/adr/adr-001`…`adr-004`; `AGENTS.md`'s blocking-unknown note was rewritten. No sprint-map change yet — Sprint 2/3/5/6 depend on the open decisions.
- 2026-09-24: Added `docs/02-ui-ux-standard.md` (normative UI/UX standard: token audit, status presentation contract, accessibility and copy rules) and listed it as required reading in `AGENTS.md`. Records one failing contrast pair (`primary` on `background`, 4.48:1) and six open UI decisions.
- 2026-09-23: Excluded the generated, git-ignored `apps/mobile/expo-env.d.ts` from Prettier so `pnpm format:check` passes on a clean checkout.
- 2026-09-23: Adapted from the Nakaw? dev-environment reference for ElderCare+: mobile-only architecture (no moderator web), product-specific data model and hard rules from `docs/00-product-flow.md` v1.1, AI footprint narrowed to OCR + text embeddings only (no image-similarity), and the model roster changed to DeepSeek V4.1 Flash (main coder), Gemini 3.8 Flash, GPT-5.6 Luna, Grok 4.6 and Claude Opus 5, wired through OpenCode subagents.
