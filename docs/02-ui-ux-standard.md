# ElderCare+ — UI/UX Standard (normative)

> **Audience:** AI coding agents (especially the main coder) and the human owner.
> **Status:** normative. Companion to `docs/00-product-flow.md` (product scope) and
> `docs/01-dev-environment.md` (tooling). **On UI/UX this file wins, except where the
> approved design documents are more specific — see §20 for the reconciliation.**
> **Snapshot:** 2026-09-24 (rev 3).
>
> **Design sources of truth for screens and visual identity:**
>
> 1. `docs/ElderCare_Plus_System_Documentation_and_User_Manual_v1.0.pdf` — status
>    **"Approved baseline for complete UI design and implementation"**, 03 August 2026.
>    It defines the roles, the 34-frame catalogue (`A-`, `E-`, `C-`, `S-`, `V-`), the
>    approved brand palette (§5.1), the six-role type scale (§5.2), the layout standard
>    (§5.3) and the safety copy.
> 2. `docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf` — the v1.0 pack
>    (34 frames + 7 variants) plus the v1.2 *Connected Family* extension (08 August 2026).
>    More specific than (1) on frame names, exact labels and per-screen build notes.
>
> §8 and §9 are transcribed from the wireframe pack. §5 (visual identity) is transcribed
> from the system documentation. §20 is the reconciliation across all sources and is the
> place to look before trusting any of them.

---

## 0. How to use this file (instructions to the agent)

1. Read this file **before writing or changing any file under `apps/mobile/src/`**, every session.
2. "must" and "never" are hard requirements, not style preferences. Deviating requires the
   owner's explicit approval, recorded in §21.
3. A new screen, component, status value or user-facing string is not done until it passes §18.
4. If this file and the code disagree, **this file wins.** Fix the code, or propose an edit to
   this file. Never silently follow the code.
5. A rule lives here or in `theme.ts`. A rule that exists only in a code comment does not exist.
6. Never invent a colour, size or radius. If a token is missing, propose adding it to
   `theme.ts` **first**.

---

## 1. Product constraints that shape the UI

The user is an older adult, often with reduced vision, tremor, hearing loss or mild cognitive
decline — frequently anxious about medication. Every rule below follows from that. Specifically:

- **One screen, one decision.**
- **Never colour alone.** Status always ships a text label *and* an icon. (§6)
- **Never clinical advice from the app.** It repeats what the caregiver entered, verbatim.
- Elder-facing text is plain-language; caregiver-facing text may assume more.
- Health data is sensitive personal data under the Philippine Data Privacy Act. No health
  content in analytics, log payloads, crash reports, or on a lock screen. (§13)

---

## 2. Single source of truth: `apps/mobile/src/constants/theme.ts`

- **Never write a raw hex colour** in a screen or component. `/^#[0-9A-Fa-f]{3,8}$/` outside
  `theme.ts` is a defect.
- **Never write a raw number** for `padding`, `margin`, `gap`, `borderRadius`, `fontSize` or
  `minHeight`. Use `spacing`, `radius`, `fontSize`.
- Allowed raw values: `0`, `flex`, `'100%'`, `borderWidth` hairlines, and layout mathematics.
- `lineHeight` must come from the token map added to `theme.ts` (see §3). Today's raw
  `lineHeight: 26` / `22` are defects.
- Tokens are **additive**. Removing or repurposing an existing token is a breaking change and
  needs an entry in §21 plus a sweep of every consumer.

---

## 3. Typography

| Token     | Size | Line height | Use                                                     |
| --------- | ---- | ----------- | ------------------------------------------------------- |
| `title`   | 26   | 34          | Screen title, one per screen                            |
| `heading` | 20   | 28          | Section headings, card titles                           |
| `body`    | 18   | 26          | All reading text, form labels, list rows                |
| `caption` | 15   | 22          | Secondary meta only — **never** the sole carrier of a status |
| —         | —    | —           | **Minimum: 15 dp. There is no smaller size.**           |

- Maximum two weights: `600` (emphasis) and `700` (screen title). Never `400`-and-hairline-thin.
- No italics. No ALL-CAPS for medical content. Sentence case for labels and buttons.
- `Text` keeps `allowFontScaling` **enabled** (the RN default). Never set it `false`.
- Set `maxFontSizeMultiplier` explicitly: **2.0** for body/reading text, **1.5** for tab labels,
  tab bar text and anything in a fixed-height container.
- Every layout must survive **200 % font scale** without clipping, overlap or a hidden primary
  action. No fixed-height container may hold text.
- Never truncate a medicine name, dose or instruction with `numberOfLines`. Wrap instead.

**Approved type scale vs this scale (conflict R9, §20.2).** The approved system
documentation (`§5.2`) specifies Fredoka + Poppins in six roles: logo 40, screen heading 32,
subheading 20, body 16, button 16, caption 12. `theme.ts` currently ships one system font at
26 / 20 / 18 / 15 and no font families or button/logo roles. This standard keeps the
**larger** sizes and the 15 dp floor pending the owner's decision (D8): the approved caption
of **12** is below the floor this standard sets for an older-adult audience, and the
approved family "screen heading 32" is larger than our `title` 26. Do not add Fredoka or
Poppins, an 11th size, or a `12` token until R9/D8 is decided. `expo-font` is already a
dependency, so the cost is the font files themselves (both are OFL-licensed and free) plus
re-verifying every screen at 200 % scale — not a new native module.

---

## 4. Touch targets

- **48 dp minimum** for every tappable thing (`touchTarget.min`).
- **56 dp** for `Mark as taken` and for any irreversible confirm (`touchTarget.primaryAction`).
- The *visual* control may be smaller than 48 dp only if its *touchable* area is ≥ 48 dp.
- `hitSlop` may enlarge a target; it may never be used to justify a small target.
- Minimum **8 dp** between adjacent targets.
- Keep primary actions **≥ 16 dp** from the screen edge (Android system gestures).
- Row height in any list: **≥ 56 dp**.

---

## 5. Colour and contrast

Contrast ratios below were computed from `theme.ts` on 2026-09-24. Recompute, do not trust
memory, if a token changes.

| Foreground | on `background` | on `surface` | Verdict |
| --- | --- | --- | --- |
| `text` | 16.67 | 17.75 | pass AA + AAA |
| `textMuted` | 5.64 | 6.00 | pass AA; **fails AAA** |
| `primary` | **4.48** | 4.77 | **fails AA on `background`** |
| `danger` | 6.18 | 6.57 | pass AA |
| `warning` | 5.57 | 5.93 | pass AA |
| `success` | 6.40 | 6.81 | pass AA |
| `border` (as a boundary) | 1.29 | — | **decorative only** |

Rules:

- Normal text (< 18 dp, or < 14 dp bold) needs **≥ 4.5:1**. Large text needs **≥ 3:1**.
  UI boundaries and icons need **≥ 3:1**.
- **Do not put `colors.primary` text on `colors.background`** — 4.48:1 fails. The current
  codebase has **no** such pairing (`primary` text sits on `surface` at 4.77:1, and is used
  for the tab active tint), so the token is **not** changed. The rule stands for new code.
  _(D2 resolved 2026-09-24: keep the token, restrict primary text to `surface`. Reopen only if
  a screen genuinely needs `primary` on `background`, in which case darken the token instead.)_
- `textMuted` is for **meta only** (timestamps, helper text). Never for a medicine name,
  dose or instruction. It fails AAA, so it is not for content that must be read.
- `colors.border` is **decorative**. It may never be the only boundary of a control, nor the
  only way a state is shown. At 1.29:1 it carries no meaning.
- Our three semantic colours are all dark and close in luminance (6.57 / 5.93 / 6.81). A
  colour-blind user cannot separate them. **This is why §6's label + icon is mandatory.**
- Never place text on `primary` as a background without recomputing the ratio first.

### 5.1 The approved brand palette (system documentation §5.1)

This is **the approved visual identity**, transcribed verbatim. It is a *fill and surface*
palette; it is not a text palette (see §5.2).

| Group | Token | Value | Approved use |
| --- | --- | --- | --- |
| Primary | Teal | `#49C3B2` | Primary elder actions, active navigation |
| Primary | Blue | `#4A8FD8` | Links, focus, informational actions |
| Primary | Purple | `#9B6FE3` | Caregiver accents and reports |
| Primary | Lavender | `#C69AF6` | Soft caregiver surfaces |
| Secondary | Mint | `#8DE0D1` | Positive supporting surfaces |
| Secondary | Sky Blue | `#78B7F3` | Informational supporting surfaces |
| Secondary | Slate Blue | `#5A74A6` | Secondary icons |
| Secondary | Navy | `#24436D` | Titles, high-emphasis actions |
| Neutral | White / Off-White | `#FFFFFF` / `#F8FAFC` | Cards and app background |
| Neutral | Light / Medium Gray | `#E8EDF4` / `#B6C0CE` | Borders and disabled controls |
| Neutral | Dark Gray / Charcoal | `#667085` / `#344054` | Secondary and primary body text |
| Semantic | Success / Warning / Error | `#1F7A4D` / `#9A5B13` / `#B42318` | Taken, caution, missed/error — **always with text/icon** |

`theme.ts` currently deviates from this palette (a different blue for `primary`, different
neutrals, and no teal, purple, lavender, mint, sky-blue or slate-blue token at all). That is
conflict **R8** (§20.2). Do not adopt the approved hexes ad hoc, and do not "fix" `theme.ts` by
pasting them in — the palette and the contrast rule below pull in opposite directions.

### 5.2 Why the bright palette cannot carry text

Computed against `#FFFFFF` on 2026-09-24:

| Approved colour | Contrast on white | Verdict as text |
| --- | --- | --- |
| Teal `#49C3B2` | **1.94** | decorative fill only |
| Mint `#8DE0D1` | **1.53** | decorative fill only |
| Sky Blue `#78B7F3` | **2.13** | decorative fill only |
| Lavender `#C69AF6` | **2.24** | decorative fill only |
| Blue `#4A8FD8` | **3.38** | large text / graphics only |
| Purple `#9B6FE3` | **3.63** | large text / graphics only |
| Slate Blue `#5A74A6` | 4.68 | pass AA |
| Dark Gray `#667085` | 4.97 | pass AA |
| Navy `#24436D` | 10.01 | pass AAA |
| Charcoal `#344054` | 10.46 | pass AAA |
| Success `#1F7A4D` | 5.32 | pass AA |
| Warning `#9A5B13` | 5.41 | pass AA |
| Error `#B42318` | 6.57 | pass AA |

Text **on** the bright fills is the trap:

| Pair | Contrast | Verdict |
| --- | --- | --- |
| Navy text on Teal fill | 5.15 | pass AA — **the correct teal button** |
| White text on Teal fill | 1.94 | **fails** |
| White text on Blue fill | 3.38 | large text only; **fails** a 16 dp button label |
| White text on Purple fill | 3.63 | large text only |
| White text on Navy fill | 10.01 | pass AAA |

Rules that follow:

- **Bright brand colours are fills, surfaces, borders and icon accents — never body text.**
- Body and title text in the brand identity is **Charcoal `#344054`** (primary) and
  **Dark Gray `#667085`** (secondary).
- A filled Teal or Blue control carries **Navy text**, not white. A Navy/Error button carries
  white. Recompute before pairing a new fill with a label.
- The approved documentation says "Primary filled gradient or solid teal/blue" (system
  documentation §5.3) but also requires ≥ 4.5:1 for normal text (§5.4). Those two clauses
  cannot both hold for white-on-teal; this section resolves the ambiguity in favour of the
  contrast rule, because it is the accessibility requirement.

---

## 6. Status presentation contract (the most important section)

There are seven status enums in `packages/shared`. **Every value of every enum must have three
things, and no screen may invent any of them:**

1. **`label`** — human-readable, sentence case. (Exists today.)
2. **`icon`** — so meaning survives without colour.
3. **`tone`** — one of `neutral` | `attention` | `danger` | `success`.

Implementation:

- Add `packages/shared/src/status-presentation.ts` exporting one frozen record per enum:
  `doseStatusPresentation`, `syncStatePresentation`, `stockStatusPresentation`,
  `appointmentStatePresentation`, `appointmentTypePresentation`,
  `prescriptionStatusPresentation`, `evidenceReviewStatusPresentation`.
  Each entry is `{ label, icon, tone }`.
- `tone` → colour is mapped in **exactly one place** in `theme.ts`
  (`statusColors: Record<Tone, string>`). No screen maps a tone or a status to a colour.
- **Screens consume `statusPresentation`. They never switch on a status value themselves.**
- **Extend `packages/shared/src/status.test.ts`** (the existing executable guard) to assert, for
  every enum value: a non-empty `label`, a non-empty `icon`, and a `tone` inside the allowed
  set. A status added without a presentation must break `pnpm test`.
- In the UI, a status is always rendered as **icon + text label**. The colour is a third,
  redundant signal.
- Status copy is **non-clinical and caregiver-directed**. Never "Stop taking this",
  "Increase your dose", "Do not use". Use "Contact your caregiver".

Current labels (all present; two are flagged for rewording):

| Enum | Values and labels |
| --- | --- |
| `DoseStatus` | `Upcoming` · `Due now` · `Taken` · `Missed` |
| `SyncState` | `Synced` · `Pending sync` |
| `StockStatus` | `Normal stock` · `Low stock` · `Out of stock` · `Expiring soon` · `Expired` · `Needs caregiver review` |
| `AppointmentState` | `Upcoming` · `Completed` · `Cancelled` · `Overdue` |
| `AppointmentType` | `Clinic visit` · `In-home visit` |
| `PrescriptionStatus` | `Draft` · `Verified` · `Expired` · `Archived` |
| `EvidenceReviewStatus` | `Pending review` · `Verified` · `Rejected` |

Note: `Missed` is a factual record, not an accusation, and the pack renders it to the
**Older Adult** role as `Missed` (`E-02`, `E-08`). Keep one word for both roles. Do not invent a
softer variant — the caregiver and the elder discussing "the same event" must use the same
label. (Decision D5, closed 2026-09-24.)

---

## 7. Role parity and authority

- Both roles use the **same visual language**. Authority differs; styling does not.
- **Never render an affordance the viewer lacks authority for.** Do not grey it out — do not
  render it. A disabled edit button tells the elder they are being restricted.
- The elder role is the **default reading level**: aim for roughly grade 6–8. Where a compound
  term is unavoidable for the caregiver (`needs caregiver review`), give the elder a plain
  variant (`Ask Maria about this medicine`).
- Caregiver-only routes must be unreachable from the elder role by tab, link **or deep link**.
  Role comes from `profiles.role` server-side; never from client state.
- **Never signal role by colour.**
- The elder's only write is confirming their own due dose, through the guarded RPC.

---

## 8. Screen anatomy, navigation and the approved screen inventory

### 8.1 Frame and structure (from the wireframe pack)

- **Base frame: 360 × 800 dp.** This is the binding constraint for every layout decision.
- **8 dp spacing grid.** (§2, §15)
- **Top app bar + bottom navigation** on every primary screen. Both are named required
  components in the pack's component guide.
- **16–24 dp card radius.** (Note: `theme.ts` currently defines `radius.md: 12`, which is
  below this range — see §20, conflict **R5**.)
- **One dominant primary action** per screen.
- Status is always paired with **an icon and the status word**. (§6)

### 8.2 Role navigation (exact approved labels)

The bottom navigation is role-specific. These strings are approved design, not suggestions:

| Role | Bottom navigation |
| --- | --- |
| Older Adult | Home · Meds · Calendar · Emergency · Profile |
| Family Caregiver | Dashboard · Meds · Calendar · Reports · Profile |
| Connected Family Member | Home · Care · Requests · Family · Profile |

**The current code does not match this.** `(elder)/elder/_layout.tsx` ships
`Today · Medicines · Prescriptions · Appointments · Emergency` and
`(caregiver)/caregiver/_layout.tsx` ships `Dashboard · Medicines · Prescriptions ·
Appointments · Profile`. See §20, conflict **R10**.

### 8.3 Screen anatomy rules

Every screen must:

1. Use `SafeAreaProvider` (already at the root) and respect top/left/right insets.
2. Render the **top app bar**: a back affordance where there is a parent, the screen title,
   and (per `00-product-flow.md` §3) the notification bell.
3. Show **one screen title** at `title` size.
4. Have **at most one primary action**, visually dominant.
5. Keep its primary action **reachable without scrolling** at 360 × 800 dp.
6. On the Older Adult role, keep **Emergency one tap from Home**.

`ScreenScaffold` is a temporary dev component. Its footer copy
("Scaffold screen — synthetic data only") is **dev-facing and must be deleted before the
screen ships**. Do not copy that notice into a real screen.

### 8.4 The approved screen inventory

Frame IDs are the exact Figma frame names. **Use them verbatim** in components, comments,
tests and commit messages so the mapping is never ambiguous.

**Access and setup (12) — `A-01` … `A-12`**

`A-01` Splash · `A-02` Welcome · `A-03` Role Selection · `A-04` Create Account ·
`A-05` Verify Account · `A-06` Sign In · `A-07` Reset Password · `A-08` Notification Setup ·
`A-09` Create Elder Profile · `A-10` Generate Link Code · `A-11` Enter Link Code ·
`A-12` Confirm Care Link

**Older Adult (15) — `E-01` … `E-15`**

`E-01` Home / Today · `E-02` Medication Schedule · `E-03` Dose Detail · `E-04` Dose Confirmed ·
`E-05` Appointments · `E-06` Appointment Detail · `E-07` Emergency Information ·
`E-08` Personal Adherence · `E-09` Medication History · `E-10` Dose History Detail ·
`E-11` Care Plan Summary · `E-12` Appointment History · `E-13` Reminder Preferences ·
`E-14` My Care Circle · `E-15` Request Help or Company

**Family Caregiver (15) — `C-01` … `C-15`**

`C-01` Family Dashboard · `C-02` Medication List · `C-03` Add/Edit Medication ·
`C-04` Medication Detail · `C-05` Missed Dose Detail · `C-06` Appointments ·
`C-07` Add/Edit Appointment · `C-08` Appointment Detail · `C-09` Adherence Report ·
`C-10` Elder Profile · `C-11` Edit Elder Profile · `C-12` Care Activity Timeline ·
`C-13` Reminder and Escalation Setting · `C-14` Care Circle Management ·
`C-15` Export Care Summary

**Connected Family Member (15) — `F-01` … `F-15`**

`F-01` Join Care Circle · `F-02` Access and Consent · `F-03` Family Home · `F-04` Elder Profile ·
`F-05` Medication Schedule · `F-06` Medication Detail · `F-07` Appointments ·
`F-08` Appointment Detail · `F-09` Emergency Information · `F-10` Care Summary ·
`F-11` Help Requests · `F-12` Help Request Detail · `F-13` Response Confirmation ·
`F-14` Family Care Circle · `F-15` Availability and Alerts

**Shared destinations (3) — `S-01` … `S-03`**

`S-01` Notification Center · `S-02` Profile and Settings · `S-03` Privacy and Consent

**Reusable state variants (7) — `V-01` … `V-07`** — specified in §9.

**Totals:** 45 role-specific screens (15 per level, the instructor compliance target) + 12
setup + 3 shared + 7 state variants.

### 8.5 Required prototype paths

These must be walkable end-to-end:

- Caregiver setup: `A-02 → A-03 → A-04 → A-05 → A-08 → A-09 → A-10 → C-01`
- Older-adult link: `A-02 → A-03 → A-04 → A-05 → A-08 → A-11 → A-12 → E-01`
- Medication creation: `C-02 → C-03 → C-04`
- Dose confirmation: `E-01`/`E-02` → `E-03` → `E-04` → `C-01`/`S-01`
- Missed-dose response: `C-01`/`S-01` → `C-05` → phone confirmation
- Appointment creation: `C-06 → C-07 → C-08 → E-05`/`E-06`
- Emergency: `E-01`/`E-07` or `C-10` → `E-07` → call confirmation
- Help request: `E-14 → E-15 → S-01`; `F-01 → F-02 → F-03 → F-11 → F-12 → F-13`

**The pack's own instruction:** *"Do not add out-of-scope features to the first-quarter
submission."*

---

## 9. Required shared states

The pack defines seven reusable variants. Build them once, in
`apps/mobile/src/components/states/`, and reuse them everywhere. Frame IDs and approved build
notes are from the pack; the sample copy is the pack's own wording and may be extended but not
contradicted.

| Frame | Component | Approved requirement |
| --- | --- | --- |
| `V-01` | `LoadingState` | Preserve the page structure while data loads. **Use skeletons or a progress indicator. Never show an indefinite blank screen.** |
| `V-02` | `EmptyState` | Name the missing content and **offer exactly one relevant action**. Do not offer unrelated actions. |
| `V-03` | `OfflinePendingSync` | **Persistent, non-blocking banner.** Label the item `Pending sync`. State that sync happens automatically. **Prevent duplicates.** |
| `V-04` | `PermissionDeniedBanner` | Non-blocking. Explain why access is useful, offer `Open Settings`, and **keep the app usable — "The app still opens when access is denied."** Banner stays visible until resolved. |
| `V-05` | `ValidationErrorState` | **Summary receives focus first.** Name the correction per field. **Entered values remain intact after validation fails.** |
| `V-06` | `DestructiveConfirmDialog` | Name the object and the consequence. **Use explicit labels, never Yes/No.** **Cancel remains the safer action.** |
| `V-07` | `SystemErrorState` | Human-readable message + `Retry` + a safe return path. **Keep existing local reminder data safe.** Never a raw stack trace. |

Additional states required by `00-product-flow.md` §5 that the pack leaves to us:

| Component | Must show |
| --- | --- |
| `NotificationCenter` (`S-01`) | Unread and Read sections, `Mark all read`, tap to open the related record. No messaging destination. |
| `FieldError` | Under the field, icon + text |
| `CareLinkBanner` | Link status + the `Unlinking removes shared access but keeps history` warning |

Rules:

- A **spinner alone is never** an acceptable loading state.
- An empty list must never render as a blank screen.
- `V-04` must never block the rest of the app. Denied permission is a banner, not a gate.

Three pieces of approved safety copy worth preserving verbatim, because they encode the
idempotency, privacy and emergency boundaries directly in the interface:

- `E-04`: "This action cannot create a duplicate confirmation."
- `V-03`: "Do not tap again. ElderCare+ prevents duplicate dose events."
- `C-05`: "ElderCare+ does not advise whether a late dose should be taken."
- `E-15`: "This sends a family alert; it does not dispatch emergency services."

---

## 10. Copy rules (normative)

**Never**, in any user-facing string:

- Suggest a substitute medicine, change a dose, or tell the elder to stop treatment.
- Present OCR/AI output as verified. Label it "Unverified — check before saving".
- Use the words "AI", "OCR", "smart", "we detected", "our algorithm" in clinical context.
- Use an abbreviation without expanding it (`mg`, `PRN`, `BD` → write it out).
- Blame the user. `You missed` → `Not recorded`.
- Use "OK", "Submit", "Yes" as a button label. Name the action.
- Use exclamation marks, or all-caps for emphasis.

**Always**:

- Repeat caregiver-entered instructions **exactly**. Never paraphrase, shorten or correct them.
- Route unclear, expired or conflicting information to a human:
  "Contact your caregiver" / "Ask your doctor or pharmacist".
- State the medicine, strength, dose and time explicitly.
- Dates and times follow the pack's own conventions exactly:
  - **Time in a dose or appointment row:** `8:00 AM`
  - **Short date on a card:** `Aug 12 - 10:00 AM`
  - **Long date in a detail view:** `Wednesday, August 12` with the time on its own line
  - **Any date needing a year:** `Aug 8, 2026`, `Jul 1, 2026`
  - **Month grouping header:** `August 2026`
  - **Relative time is allowed for recency and urgency only:** `12 min ago`,
    `1 hr 12 min ago`, `Yesterday`, `Today at 3:00 PM`, `in 5 days`.
- **Never use relative time alone for a care instruction.** `E-03` shows an absolute
  `SCHEDULED TIME` (`8:00 AM`) *and* the instruction. A dose must never be described as only
  "in 5 minutes" or "this afternoon" — tremor, distraction and poor eyesight make relatives
  unreliable, and the schedule is the safety-critical fact.
- A record that a caregiver or elder may need to reason about later must carry an absolute date
  somewhere on the screen (§12, `E-10`'s `Scheduled time` / `Confirmed time` pair).
- Errors say what happened **and** what to do next.
- Sentence case.

---

## 11. Forms and validation

- Label **above** the field. Never placeholder-as-label.
- Field height ≥ 48 dp; label text ≥ `body`.
- Correct keyboard per field (`keyboardType`, `autoComplete`, `textContentType`).
- Validate **on blur**, not on every keystroke.
- Errors inline, under the field, as **icon + text** — never colour alone.
- State required vs optional **in text**, not by an asterisk alone.
- Never lose entered input on a failed submit, a navigation, or a background/foreground cycle.
- Numeric fields: no `0` default that could silently mean "no dose".

---

## 12. Destructive and irreversible actions

Requires explicit confirmation that **names the record and the effect**, plus an `audit_events`
row:

- Stock adjustment or any inventory correction
- Correcting a confirmed dose
- Verifying or rejecting prescription evidence
- Changing a past appointment state
- Unlinking a care link, deleting an account, or changing evidence access

Also requires:

- A **reason** field where the data model demands one (stock adjustments).
- **Re-authentication** for consent, unlink, account deletion and evidence-access changes.
- Wording in the form "Remove the link with Maria? Maria will lose access to your medicine
  plan. This cannot be undone." — never a bare "Are you sure?".

Never hard-delete medical history. The UI says **deactivate** or **archive**, and shows the
timestamp.

---

## 13. Notifications and lock-screen copy

- Lock-screen text is **minimal**: no medicine name, no condition, no dose, no prescriber.
  Good: `ElderCare+: 1 medicine due. Open the app for details.`
- Full medical detail appears **only after authenticated in-app navigation**.
- No badge count that reveals how many medicines exist.
- Never put a care instruction, an allergy, or a condition in a notification body.
- Permission is requested only **after** explaining why, in context (`welcome.tsx`'s job).

---

## 14. Accessibility

- **Every** interactive element needs `accessibilityRole` and an `accessibilityLabel` that
  names the action *and* its object: `Mark as taken, Metformin 500 mg, 8:00 AM`.
  _(Currently zero exist in the codebase.)_
- Use `accessibilityHint` only when the result is not obvious from the label.
- Group a list row with `accessible={true}` so the screen reader reads the row as one unit.
- `accessibilityState` for `selected`/`disabled`/`busy`/`checked` where it applies.
- Decorative images: `importantForAccessibility="no"` (Android) /
  `accessibilityElementsHidden` (iOS).
- **Announce status changes** (`AccessibilityInfo.announceForAccessibility`) — e.g. after a dose
  is confirmed and after an offline sync succeeds.
- Reading order must match visual order.
- No time-limited interaction, and no interaction that requires a swipe or a long-press alone.
- Support **200 % font scale** (§3) and **reduced motion** for any animation.
- Contrast per §5.
- Target: **WCAG 2.2 AA** where it maps to native, plus Android and iOS platform guidance.

---

## 15. Layout, spacing and motion

- Spacing tokens only, on an 8 dp rhythm (`xs` 4 is for tight pairs and icon-to-text only).
- Screen padding: `spacing.lg` (24).
- List rows: divider via `colors.border`, min height 56 dp.
- Never nest a scrollable inside a scrollable.
- Never place a fixed footer over scrollable content without padding it clear.
- Motion only to explain a state change, ≤ 200 ms, and never the sole carrier of information.
  Reanimated is installed — justify every use.

---

## 16. Platform behaviour

- Android hardware back must **never** discard unsaved input silently. Confirm before discard.
- Emergency numbers open the dialer via `Linking.openURL('tel:…')`, after user confirmation.
  The app never calls, dispatches, or shares location automatically.
- Safe areas come from `SafeAreaProvider`. Respect the **bottom** inset in any full-screen
  (non-tab) view.
- Verify on Android that the last list item and the primary action clear the tab bar
  (edge-to-edge).
- Test at **360 dp width** — the narrow, common budget-Android size. It is the binding
  constraint for §3 and §4.

---

## 17. Anti-patterns (never do these)

| Never | Because |
| --- | --- |
| Status by colour alone | Hard product rule; our semantic colours are indistinguishable to colour-blind users |
| `colors.primary` text on `background` | 4.48:1 — fails AA |
| `border` as a control boundary | 1.29:1 — invisible as a boundary |
| Grey out an action the viewer can't perform | Signals restriction; render nothing instead |
| A raw hex or raw `padding` in a screen | Breaks the single source of truth |
| `numberOfLines` on a medicine name or instruction | Hides clinical content |
| Fixed-height container holding text | Breaks at 200 % font scale |
| Spinner-only loading, blank empty state | `00-product-flow.md` §5 |
| Disabled button as validation feedback | Elder cannot tell why it is disabled |
| "Are you sure?" with no named record | Cannot be reasoned about |
| Medicine name or condition on a lock screen | Privacy rule |
| `allowFontScaling={false}` | Defeats the OS accessibility setting |
| Advice, substitute or dose change in any string | Hard product rule |
| Placeholder text as the only field label | Disappears on focus and breaks autofill |

---

## 18. UI review checklist (the merge gate)

**Every UI change**

- [ ] No raw hex or raw spacing number outside `theme.ts`
- [ ] No text below 15 dp; text scale ≥ 120 % tested
- [ ] All targets ≥ 48 dp (≥ 56 dp for `Mark as taken` and irreversible confirms)
- [ ] Every status rendered as **icon + label**; no colour-only meaning
- [ ] Contrast recomputed if any colour changed (§5)
- [ ] Every interactive element has `accessibilityRole` + action-naming `accessibilityLabel`
- [ ] No clinical advice, no substitute, no dose change in any string
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` green

**New screen**

- [ ] Screen title, and the notification-bell top app bar (§8.3)
- [ ] Uses the pack's exact frame ID (`A-`, `E-`, `C-`, `F-`, `S-`, `V-`) in the component name,
      a comment, and the commit message (§8.4)
- [ ] Appears in the invented navigation nowhere: role bottom nav matches §8.2 exactly
- [ ] At most one primary action, reachable without scrolling at 360 × 800 dp
- [ ] Loading, empty, error, offline and pending-sync states handled where applicable (§9)
- [ ] Dev-only scaffold copy removed
- [ ] Unreachable from the other roles, including by deep link
- [ ] Verified on a real device at 360 dp and at 200 % font scale (light only — D1)

**Status, dose or clinical content**

- [ ] Presentation entry added to `packages/shared` (§6); test fails without it
- [ ] `tone` used, never a hardcoded colour
- [ ] `@challenger` consulted for anything touching the confirmation loop, offline sync or RLS
- [ ] `@gemini-reviewer` consulted for a UI/accessibility pass

---

## 19. How compliance is verified

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
2. `packages/shared` tests are the executable guard for §6 — a status without a label, icon or
   valid tone must fail `pnpm test`.
3. Contrast (§5) is recomputed by script, not by eye: `scripts/check-contrast.mjs` reads
   `theme.ts`, recomputes each documented pair, and exits non-zero below threshold.
   Run it with `pnpm run check:contrast`. _(Written 2026-09-24, decision D6.)_
4. Device pass before merge: Android, **360 × 800 dp** frame, font scale 100 % **and** 200 %,
   light (dark mode is not built — D1), TalkBack on. Confirm the seven `V-01`…`V-07` variants
   by actually triggering them (airplane mode, denied permission, invalid form, server
   unreachable).
5. `@gemini-reviewer` for accessibility, `@challenger` for anything touching status,
   confirmation-loop, offline sync or RLS.

---

## 20. Reconciliation with the approved design documents

All four sources were read on 2026-09-24. The two PDFs were read by extracting their text;
**the PDFs themselves are the authority**. Re-read them any time with the checked-in,
dependency-free extractor:

```bash
node scripts/pdf-text.mjs docs/ElderCare_Plus_System_Documentation_and_User_Manual_v1.0.pdf --out sysdoc.txt
node scripts/pdf-text.mjs docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf --out wireframes.txt
```

Do not treat the extracted `.txt` files as sources — regenerate them, and trust the PDF.

- `docs/ElderCare_Plus_System_Documentation_and_User_Manual_v1.0.pdf` — **the approved
  baseline** ("Status: Approved baseline for complete UI design and implementation",
  03 August 2026, Application 1.0.0). 28 pages. Defines roles, the 34-frame catalogue, the
  brand palette, the type scale and the safety copy. **Now readable** (earlier revisions of
  this file wrongly said its text could not be extracted).
- `docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf` — the v1.0 pack
  (34 frames + 7 state variants) plus the v1.2 Connected Family extension (08 August 2026,
  3 user levels × 15 screens).
- `docs/00-product-flow.md` — the repo's stated product source of truth, **v1.1 "AI Product
  Flow and Build Brief"**.
- The code (`packages/shared`, `apps/mobile`, `services/ai`, `app.json`).

**Headline finding:** the approved system documentation agrees with the wireframe pack on
**scope**, and disagrees with `00-product-flow.md` + the code. The repo's product-flow doc is
*broader* than the approved baseline, not the other way round. That inverts the earlier
reading of C-R2/C-R3/C-R4.

### 20.1 Confirmed by the pack (these rules are now verified, not invented)

| Rule | Pack evidence |
| --- | --- |
| 48 dp minimum touch target, 56 dp elder primary action | "Wireframe Rules" §1 |
| 8 dp spacing grid | "Wireframe Rules" §1 |
| One dominant primary action per screen | "Wireframe Rules" §1 |
| Status = semantic colour **+ status word + icon** | "Wireframe Rules" §2 |
| Required status labels `Taken` `Due` `Upcoming` `Missed` `Pending sync` `Cancelled` | "Wireframe Rules" §2 |
| Top app bar + bottom nav on primary screens | "Wireframe Rules" §1–2, every frame |
| Text follows the **device** text-size setting | `S-02` build note |
| Minimal notification content | `A-08`, `S-02` |
| Non-blocking permission-denied banner | `V-04` |
| Confirmation must not duplicate a dose | `E-04`, `V-03` |
| No advice about a late dose | `C-05` |
| Never hard-delete; changes affect future doses only | `C-04`, `V-06` |
| Persist entered values through a validation failure | `V-05` |
| Explicit confirm labels, never Yes/No | `V-06` |
| Emergency: dialer only, no dispatch | `E-07`, `E-15`, `F-09` |
| 360 dp is the design width | Cover page |

My earlier `[verify on device]` estimate in §17 was **correct**: 360 dp is the approved design
width, and `S-02` explicitly delegates text size to the device setting, which makes §3's
200 % font-scale requirement a real, designed-for constraint rather than a precaution.

**Corroborated by the approved system documentation** (independent of the pack — this is the
"approved baseline", so these rules are doubly confirmed):

| Rule | System documentation evidence |
| --- | --- |
| 48 dp minimum; 56 dp elder primary button | §5.3 "Touch targets" |
| 8 dp grid; 8/16/24/32 spacing | §5.3 "Spacing" |
| 360 × 800 dp design frame | §5.3 "Design frame" |
| 16–24 dp card radius | §5.3 "Cards" |
| ≥ 4.5:1 normal text; 3:1 large text and graphics | §5.4 |
| Status = text + icon + semantic colour | §5.3 "Status", §5.4, BR-02 |
| Top app bar (title, Back, **one notification bell, no message icon**) | §4.1 |
| **Five-item** bottom navigation, top-level destinations only | §4.1 |
| One primary action per screen, visually dominant | §4.1, §5.1 |
| Emergency = persistent elder destination, caregiver profile action | §4.1 |
| Grace period default 30 min, 5–120 in 5-min steps | BR-03 |
| Taken accepted once; repeated taps do not duplicate | BR-04 |
| Adherence = Taken ÷ (Taken + Missed) × 100 | BR-05 |
| Edit/deactivate affects **future** doses only; history stays | BR-06, §7.2 |
| Offline shows `Pending sync`, uploads once | BR-08, V-03 |
| Never advise on a late dose; never substitute or change a dose | §8.2, §11.2 |
| Minimal lock-screen content | §11.1 |
| Explicit confirm labels (`Mark as Taken`, `Deactivate medication`) | §11.2 |

The system documentation's §6 catalogue is the **same 34 frames** as wireframe v1.0
(`A-01`…`A-12`, `E-01`…`E-08`, `C-01`…`C-11`, `S-01`…`S-03`) plus `V-01`…`V-07`. The v1.2
pack is what adds `E-09`…`E-15`, `C-12`…`C-15` and the 15 `F-` frames.

### 20.2 Conflicts the owner must resolve (blocking — do not implement around these)

**Which sources agree, per conflict** — the owner's decision is really "which document is the
scope baseline?":

| Conflict | Approved system doc v1.0 | Wireframe pack v1.2 | `00-product-flow.md` v1.1 + code |
| --- | --- | --- | --- |
| **C-R1** third role | 2 roles | **3 roles** | 2 roles |
| **C-R2** prescriptions / OCR / evidence | absent | absent | **present** (Flow E, `prescription.ts`, `app.json` camera) |
| **C-R3** stock / expiry / batches | absent | absent | **present** (Flow D, `inventory.ts`) |
| **C-R4** emergency contacts | **one** contact | one contact | **five ordered** numbers |

So C-R1 is a conflict between the v1.2 pack and *everything else*. C-R2/C-R3/C-R4 are
conflicts between `00-product-flow.md` + code and *both* approved design documents. Read each
below before deciding; `docs/adr/adr-001`…`adr-004` hold the decision briefs.

**C-R1 — There is a third user role.**
The v1.2 extension adds **15 Connected Family Member screens** (`F-01`…`F-15`) as a distinct
user level, to satisfy an instructor requirement of "3 distinct user levels × 15 screens = 45".
It defines invitations, consent, read-only care access, help requests, response ownership and
availability. This conflicts with:

- **System documentation §2.1 and §2.2**: exactly two roles (Older Adult, Family Caregiver)
  and "Version 1.0 permits one active caregiver link for one elder account"; §1.4 lists
  "Multiple caregivers per elder, in-app chat, video calls or social feeds" as **out of scope**.
- `00-product-flow.md` §2: "One active caregiver-to-one elder link"
- `01-dev-environment.md` §4.2: "there is no separate moderator/admin web app"
- `packages/shared/src/role.ts`: `userRoleSchema = z.enum(['caregiver', 'elder'])` — two roles
- `apps/mobile/src/app/(auth)/role-select.tsx`: two role cards

**This is the highest-impact item in this file.** It affects the data model, every RLS policy,
the route tree, the auth flow and the role enum. Decide before Sprint 1.

**C-R2 — Prescriptions, photo evidence and OCR are absent from the approved documents.**
The words prescription, evidence, photo, scan, OCR and embedding appear **zero times** in the
entire 45-screen pack, and the system documentation is equally silent: §1.4 excludes "AI or RAG
medical assistant" and §11.1 says "**no location, microphone, camera, contacts or SMS
permission in version 1.0**". `S-03` lists camera among data *not collected*. The v1.2 pack's
`E-02`/`C-02` also carry no prescription destination.

It is `00-product-flow.md` Flow E, `01-dev-environment.md` §2/§11 Sprint 6,
`packages/shared/src/prescription.ts`, `(elder)/elder/prescriptions.tsx`,
`(caregiver)/caregiver/prescriptions.tsx`, the `expo-image-picker` / `expo-camera` permissions
in `app.json`, and the `services/ai` `/ocr` endpoint that put prescriptions and OCR **in**
scope.

**C-R3 — Inventory, stock and expiry tracking are absent from the approved documents.**
The system documentation lists "**Medicine stock tracking, pharmacy ordering, payments or
insurance processing**" as explicitly out of scope (§1.4) and its entity list has no batch or
inventory entity (§7.2). `C-02`'s build note reads **"No stock or refill tracking."** and
`C-03` has no batch, quantity, lot, expiry or low-stock-threshold field.

It is `00-product-flow.md` Flow B/D, `01-dev-environment.md` §11 Sprint 3/5,
`packages/shared/src/inventory.ts` (six `StockStatus` values) and `00-product-flow.md` §8
("expire/low stock is never represented by color alone") that put stock **in** scope. Nothing
in either approved document renders a `StockStatus`.

**C-R4 — Emergency contacts: one, or five ordered numbers?**
Both approved documents define **one** emergency contact. The system documentation §6.2 `E-07`
is "Name, birth date, blood type, allergies, conditions, current active medicines, care
instructions, doctor and **Call contact**"; §7.2 lists "Emergency Contact — Primary person and
call number"; FR-03 says "one emergency contact". The pack's `C-11` and `F-09` match.

`00-product-flow.md` §4 G3 instead requires **five ordered** numbers (local emergency service,
primary caregiver, alternate family contact, doctor/clinic, optional pharmacy), each with
label, phone, `priority` and a verified timestamp, backed by the `emergency_numbers` table
(§6).

**R5 — Card radius.**
Both approved documents require 16–24 dp (pack "Wireframe Rules"; system documentation §5.3
"Cards"); `theme.ts` has `radius.md: 12`. Trivial, but it is a token change, so it needs
approval and a sweep.

**R6 — `Missed` wording.** Open decision **D5 is now closed: keep `Missed` for the Older Adult
role.** `E-02` and `E-08` both render `Missed` to the elder, so the earlier suggestion to
rename it for the elder role contradicted the approved design. Withdrawn.

**R7 — `E-14` shows "12 km away".** That implies the app knows a relative's distance, while
`S-03` states no location is collected. Most likely it is manually entered availability text,
but it must not become geolocation.

**R8 — `theme.ts` does not use the approved brand palette.**
The approved palette is §5.1 above. `theme.ts` ships `primary #1D6FE0` (approved Blue is
`#4A8FD8`), `background #F6F8FA` (approved Off-White `#F8FAFC`), `text #101828` (approved
Charcoal `#344054`), and has **no token at all** for teal, purple, lavender, mint, sky blue,
slate blue or navy. It also darkens `warning` (`#8A5A00` vs approved `#9A5B13`) and `success`
(`#17683C` vs approved `#1F7A4D`).

This looks deliberate — the darkening is what makes those colours pass AA (§5.2) — but it was
never recorded. **Do not paste the approved hexes into `theme.ts`**: several fail the
project's own 4.5:1 rule as text. Decide the reconciliation (adopt a `fills`/`text` split with
the approved hue family, or keep the darkened tokens and record the deviation). _Decision D9._

**R9 — Typography scale and font families differ from the approved scale.**
System documentation §5.2 specifies Fredoka (logo 40, screen heading 32) + Poppins
(subheading 20, body 16, button 16, caption 12). `theme.ts` has one system font at 26 / 20 /
18 / 15, no families, and no button or logo role. See the note in §3. _Decision D8._

**R10 — Bottom-navigation wording.**
The pack's approved strings (§8.2) are `Home · Meds · Calendar · Emergency · Profile` (elder)
and `Dashboard · Meds · Calendar · Reports · Profile` (caregiver). The system documentation's
prose says "Medications" (§8.2, §9.3) and "Reports" (§8.5). "Reports" agrees; only
`Meds` vs `Medications` differs. §8.2 keeps the pack's `Meds` because it is a literal frame
string, and because five tab labels at 15 dp in 360 dp cannot carry the longer word. Recorded,
not silently changed.

**Also confirmed**: the system documentation §4.1 requires **one notification bell and no
message icon** (messaging is out of scope) — so §8.3's bell is right and a chat entry point is
forbidden. §4.1 also makes Emergency a *profile action* for the caregiver and a persistent
*destination* for the elder, matching the §8.2 tab tables.

### 20.3 Decision log

| # | Decision | Status |
| --- | --- | --- |
| **D1** | Dark mode: **resolved 2026-09-24 — lock to light.** The approved design has no dark frames, and `userInterfaceStyle: "automatic"` with `StatusBar style="auto"` produced an unstyled OS-dark rendering. `app.json` now sets `"userInterfaceStyle": "light"` and `_layout.tsx` sets `<StatusBar style="dark" />`. Reversible; revisit only if the owner commissions a dark palette. | **resolved** |
| **D2** | `primary` 4.48:1 on `background`: **resolved 2026-09-24 — keep the token**, restrict `primary` text to `surface` (4.77:1). No current code violates this. | **resolved** |
| **D3** | Top app bar: **confirmed required by both documents.** A "how", not a "whether". | confirmed |
| **D4** | Elder tab labels: **resolved** — `Home · Meds · Calendar · Emergency · Profile` | resolved |
| **D5** | `Missed` wording per role: **resolved** — keep `Missed` for both | resolved |
| **D6** | Enforce §6 + §5: **resolved 2026-09-24 — implemented.** `packages/shared/src/status-presentation.ts`, the extended `status.test.ts` guard, `statusColors` in `theme.ts`, and `scripts/check-contrast.mjs` now exist and run under `pnpm test` / `pnpm run check:contrast`. | **resolved** |
| **D7** | Which document wins where the sources disagree (C-R1–C-R4). **Decision briefs written**: `docs/adr/adr-001`…`adr-004`. The owner still has to choose and sign each one. | **blocking** |
| **D8** | Typography (R9): adopt the approved Fredoka/Poppins 32/20/16/12 scale (`expo-font` is already installed; the fonts are OFL-licensed), or keep the larger system-font scale and record the deviation. | open |
| **D9** | Palette (R8): reconcile `theme.ts` with the approved brand palette — a `fills` vs `text` split, or keep the darkened tokens and document it. | open |

---

## 21. Changelog

- 2026-09-24: Created. First normative UI/UX standard. Records the initial token audit
  (contrast table §5), the status-presentation contract (§6), and the accessibility rules (§14).
- 2026-09-24: Reconciled against the approved wireframe pack. Replaced the invented §8 with the
  pack's confirmed frame rules, exact role navigation and the 45-screen inventory (§8); rewrote
  §9 from the seven approved `V-01`…`V-07` variants; corrected the §10 date conventions to match
  the pack. Added §20 and opened four blocking conflicts (**C-R1** third role, **C-R2**
  prescriptions/OCR absent, **C-R3** stock/expiry dropped, **C-R4** single emergency contact).
  Closed D4 and D5.
- 2026-09-24 (rev 3): **Read the approved system documentation PDF** (28 pages, previously
  believed unreadable). Added its role/permission model, out-of-scope list, brand palette
  (§5.1), contrast computation for that palette (§5.2), type scale, layout and safety copy to
  this file. **Reframed §20**: the approved baseline agrees with the wireframe pack on scope,
  so C-R2/C-R3/C-R4 are conflicts between `00-product-flow.md` + code and *both* approved
  documents, while C-R1 is the only place the v1.2 pack stands alone. Added conflicts **R8**
  (palette deviation), **R9** (typography deviation), **R10** (nav wording). Closed **D1**
  (light-mode lock) and **D2** (keep `primary`); implemented **D6** (status presentation, the
  label/icon/tone test guard, `statusColors`, and `scripts/check-contrast.mjs`). Opened **D8**
  and **D9**. Wrote scope decision briefs `docs/adr/adr-001`…`adr-004` (D7).
