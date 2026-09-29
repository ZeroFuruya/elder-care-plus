/**
 * Sprint 2 copy ledger (docs/specs/sprint-2.md, acceptance criterion 22).
 *
 * Every static string the elder-profile screens render is listed here with the approved source it
 * comes from. The sources are, in order of authority:
 *
 * - `wireframe` — `docs/ElderCare_Plus_Complete_Wireframes_Connected_Family_v1.2.pdf`, the frame
 *   named in the entry. Frame titles, section headings and field labels are taken verbatim.
 * - `ui-standard` — `docs/02-ui-ux-standard.md`, with the section that states the rule.
 * - `approved-copy` — the owner-approved copy table in `docs/specs/sprint-2.md`
 *   (§Approved copy, 2026-09-29).
 * - `shared-package` — a label or message already exported by `@eldercare/shared`.
 * - `spec` — a column or concept named by the approved `docs/specs/sprint-2.md`.
 * - `existing-app` — shipped by an earlier sprint and reused unchanged.
 * - `owner-approved` — no approved source existed, so the wording was escalated to the owner, who
 *   approved it verbatim on 2026-09-30. `source` keeps the record of why the string was needed.
 * - `escalated` — **no approved source exists and the owner has not ruled on the wording**. The
 *   implementer proposes it and `COPY_ESCALATIONS` is exactly this list.
 *
 * Accessibility labels are not enumerated: each one is either the visible label itself or a
 * template over the visible label plus the record's own name (`Edit Ana Dela Cruz`,
 * `Move Ana Dela Cruz up`), which keeps them traceable to the entry for that label.
 *
 * `<name>` marks a value the record supplies; the surrounding words are the approved copy.
 */

export type CopySourceKind =
  | 'wireframe'
  | 'ui-standard'
  | 'approved-copy'
  | 'shared-package'
  | 'spec'
  | 'existing-app'
  | 'owner-approved'
  | 'escalated';

export interface CopyEntry {
  /** The exact string as rendered, with `<name>`/`<record>` marking record-supplied values. */
  text: string;
  frame: 'A-09' | 'C-10' | 'C-11' | 'E-07' | 'C-02' | 'C-03' | 'C-04' | 'Profile tab';
  kind: CopySourceKind;
  source: string;
}

export const COPY_SOURCES: CopyEntry[] = [
  // -------------------------------------------------------------------------
  // A-09 Create Elder Profile (and the shared profile form used by C-11)
  // -------------------------------------------------------------------------
  { text: 'Create elder profile', frame: 'A-09', kind: 'wireframe', source: 'A-09 frame title' },
  { text: 'Loading…', frame: 'A-09', kind: 'existing-app', source: 'existing screen pattern' },
  { text: 'Identity', frame: 'A-09', kind: 'wireframe', source: 'A-09 section IDENTITY' },
  {
    text: 'Birth date',
    frame: 'A-09',
    kind: 'wireframe',
    source: 'A-09 field (shown as `Birth date *`)',
  },
  { text: 'Blood type', frame: 'A-09', kind: 'wireframe', source: 'A-09 field' },
  {
    text: 'Medical summary',
    frame: 'A-09',
    kind: 'wireframe',
    source: 'A-09 section MEDICAL SUMMARY',
  },
  { text: 'Conditions', frame: 'A-09', kind: 'wireframe', source: 'A-09 field' },
  { text: 'Allergies', frame: 'A-09', kind: 'wireframe', source: 'A-09 field' },
  { text: 'Care instructions', frame: 'A-09', kind: 'wireframe', source: 'A-09 field' },
  {
    text: 'Doctor and emergency',
    frame: 'A-09',
    kind: 'wireframe',
    source: 'A-09 section DOCTOR AND EMERGENCY',
  },
  { text: 'Primary doctor', frame: 'A-09', kind: 'wireframe', source: 'A-09 field' },
  { text: 'Phone number', frame: 'A-09', kind: 'wireframe', source: 'C-11 field `Phone number *`' },
  {
    text: 'Address',
    frame: 'A-09',
    kind: 'spec',
    source: '§Screens A-09 "address"; E-07 card title',
  },
  {
    text: 'Address line 1',
    frame: 'A-09',
    kind: 'owner-approved',
    source: 'no address field vocabulary exists in the wireframes or the UI standard',
  },
  {
    text: 'Address line 2',
    frame: 'A-09',
    kind: 'owner-approved',
    source: 'no address field vocabulary exists in the wireframes or the UI standard',
  },
  { text: 'City', frame: 'A-09', kind: 'owner-approved', source: 'no approved address vocabulary' },
  {
    text: 'Region',
    frame: 'A-09',
    kind: 'owner-approved',
    source: 'no approved address vocabulary',
  },
  {
    text: 'Postal code',
    frame: 'A-09',
    kind: 'owner-approved',
    source: 'no approved address vocabulary',
  },
  {
    text: 'Country',
    frame: 'A-09',
    kind: 'owner-approved',
    source: 'no approved address vocabulary',
  },
  {
    text: 'Select date',
    frame: 'A-09',
    kind: 'owner-approved',
    source:
      'shown inside `Birth date` before a date is chosen; the owner retired the typed `YYYY-MM-DD` hint in favour of a native picker and approved this placeholder (2026-09-30)',
  },
  {
    text: 'Done',
    frame: 'A-09',
    kind: 'owner-approved',
    source:
      'confirms the inline date picker on iOS, which has no modal presentation (Android uses the system dialog wording); approved 2026-09-30',
  },
  {
    text: 'Enter a phone number with at least 3 digits',
    frame: 'A-09',
    kind: 'shared-package',
    source: '`emergencyNumberInputSchema` message',
  },
  { text: 'Save and continue', frame: 'A-09', kind: 'wireframe', source: 'A-09 PRIMARY ACTION' },

  // -------------------------------------------------------------------------
  // C-11 Edit Elder Profile (profile form labels + the contacts manager)
  // -------------------------------------------------------------------------
  { text: 'Edit elder profile', frame: 'C-11', kind: 'wireframe', source: 'C-11 frame title' },
  { text: 'Doctor', frame: 'C-11', kind: 'wireframe', source: 'C-11 section DOCTOR' },
  { text: 'Save changes', frame: 'C-11', kind: 'wireframe', source: 'C-11 PRIMARY ACTION' },
  {
    text: 'Emergency contact',
    frame: 'C-11',
    kind: 'wireframe',
    source: 'C-11 section EMERGENCY CONTACT',
  },
  { text: 'Name', frame: 'C-11', kind: 'wireframe', source: 'C-11 field `Name *`' },
  {
    text: 'Category',
    frame: 'C-11',
    kind: 'spec',
    source: '§Data touched `emergency_numbers.category`',
  },
  {
    text: 'Emergency service, Primary caregiver, Alternate family contact, Doctor or clinic, Pharmacy',
    frame: 'C-11',
    kind: 'shared-package',
    source: '`emergencyCategoryLabels`',
  },
  {
    text: 'A positive, A negative, B positive, B negative, AB positive, AB negative, O positive, O negative, Not recorded',
    frame: 'C-11',
    kind: 'shared-package',
    source: '`bloodTypeLabels`',
  },
  { text: 'Emergency contacts', frame: 'C-11', kind: 'approved-copy', source: '§Approved copy' },
  {
    text: 'No emergency contacts yet.',
    frame: 'C-11',
    kind: 'owner-approved',
    source: 'no approved empty-state string for the contacts list',
  },
  {
    text: 'Primary contact',
    frame: 'C-11',
    kind: 'owner-approved',
    source: 'names `is_primary` / ADR-004 "one dominant call action"; wording not approved',
  },
  { text: 'Verified by caregiver', frame: 'C-11', kind: 'approved-copy', source: '§Approved copy' },
  {
    text: 'Verify',
    frame: 'C-11',
    kind: 'wireframe',
    source: 'A-05 `Verify`; §Screens user story 2 "verify"',
  },
  { text: 'Edit', frame: 'C-11', kind: 'wireframe', source: 'C-10 action `Edit`' },
  {
    text: 'Move up',
    frame: 'C-11',
    kind: 'owner-approved',
    source: '§Screens user story 2 "order"; the wording is proposed',
  },
  {
    text: 'Move down',
    frame: 'C-11',
    kind: 'owner-approved',
    source: '§Screens user story 2 "order"; the wording is proposed',
  },
  {
    text: 'Add contact',
    frame: 'C-11',
    kind: 'owner-approved',
    source: 'the wireframe verb is `Add medication` (C-06); no contact equivalent exists',
  },
  {
    text: 'Enter a name for this contact.',
    frame: 'C-11',
    kind: 'owner-approved',
    source: 'the shared schema message says "A label is required", which is not caregiver copy',
  },
  {
    text: 'Deactivate',
    frame: 'C-11',
    kind: 'ui-standard',
    source: '§12 "the UI says deactivate or archive"; §Screens user story 2',
  },
  {
    text: 'Deactivate <name>?',
    frame: 'C-11',
    kind: 'ui-standard',
    source: '§12 name the record and the effect',
  },
  {
    text: 'They stay in the record, but the older adult no longer sees them.',
    frame: 'C-11',
    kind: 'owner-approved',
    source: '§12 requires naming the effect; the wording is proposed',
  },
  {
    text: 'Deactivate contact',
    frame: 'C-11',
    kind: 'ui-standard',
    source: '§11.2 confirm-label pattern (`Deactivate medication`)',
  },
  { text: 'Cancel', frame: 'C-11', kind: 'existing-app', source: '`ConfirmDialog` default' },
  {
    text: 'The action could not be completed. Please try again.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`link.tsx` fallback (§10: say what happened and what to do next)',
  },
  {
    text: 'Could not load the elder profile.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` read fallback',
  },
  {
    text: 'Could not load the emergency numbers.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` read fallback',
  },
  {
    text: 'Could not save the elder profile.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` write fallback',
  },
  {
    text: 'Could not save the emergency number.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` write fallback',
  },
  {
    text: 'Could not save the new order.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` write fallback',
  },
  {
    text: 'Could not verify the emergency number.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` write fallback',
  },
  {
    text: 'Could not remove the emergency number.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`db/emergency.ts` write fallback',
  },
  {
    text: 'Only the linked caregiver can change this.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`emergencyWriteError` 42501 mapping',
  },
  {
    text: 'Another contact already uses that category or position. Refresh and try again.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`emergencyWriteError` 23505 mapping',
  },
  {
    text: 'Some details are not valid. Check the form and try again.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`emergencyWriteError` 23514 mapping',
  },
  {
    text: 'That emergency number no longer exists. Refresh and try again.',
    frame: 'C-11',
    kind: 'existing-app',
    source: '`emergencyWriteError` P0002 mapping',
  },

  // -------------------------------------------------------------------------
  // C-10 Elder Profile (read view)
  // -------------------------------------------------------------------------
  { text: 'Elder profile', frame: 'C-10', kind: 'wireframe', source: 'C-10 frame title' },
  {
    text: 'Full name',
    frame: 'C-10',
    kind: 'wireframe',
    source: 'C-10 identity block / A-09 field',
  },
  {
    text: 'Not verified yet',
    frame: 'C-10',
    kind: 'owner-approved',
    source: 'the per-contact unverified state',
  },
  {
    text: 'No emergency information yet.',
    frame: 'C-10',
    kind: 'approved-copy',
    source: 'first sentence of the §Approved copy empty state',
  },
  {
    text: "Create the older adult's care and emergency profile.",
    frame: 'C-10',
    kind: 'wireframe',
    source: 'A-09 PURPOSE block',
  },
  {
    text: 'Create elder profile',
    frame: 'C-10',
    kind: 'wireframe',
    source: 'A-09 frame name used as the action',
  },
  {
    text: 'No linked older adult',
    frame: 'C-10',
    kind: 'owner-approved',
    source: 'no approved no-link string on the caregiver side',
  },
  {
    text: 'Link with older adult first.',
    frame: 'C-10',
    kind: 'owner-approved',
    source: 'reuses the A-10 frame name; the sentence is proposed',
  },

  // -------------------------------------------------------------------------
  // Profile tab entry points
  // -------------------------------------------------------------------------
  {
    text: 'Elder profile',
    frame: 'Profile tab',
    kind: 'wireframe',
    source: 'C-10 frame name used as the action',
  },
  {
    text: 'Edit profile',
    frame: 'Profile tab',
    kind: 'wireframe',
    source: 'C-10 PRIMARY ACTION',
  },

  // -------------------------------------------------------------------------
  // E-07 Emergency Information (shipped in this sprint, listed for completeness)
  // -------------------------------------------------------------------------
  { text: 'Emergency', frame: 'E-07', kind: 'wireframe', source: 'E-07 frame name' },
  {
    text: 'Show this to anyone helping you',
    frame: 'E-07',
    kind: 'existing-app',
    source: 'shipped subtitle',
  },
  {
    text: 'No emergency information yet. Your caregiver sets this up.',
    frame: 'E-07',
    kind: 'approved-copy',
    source: '§Approved copy',
  },
  {
    text: 'Call <name> - emergency contact',
    frame: 'E-07',
    kind: 'approved-copy',
    source: '§Approved copy',
  },
  { text: 'Call <name>', frame: 'E-07', kind: 'approved-copy', source: '§Approved copy' },
  { text: 'Call', frame: 'E-07', kind: 'existing-app', source: '`ConfirmDialog` fallback label' },
  {
    text: 'The emergency service number is not verified yet. Contact your caregiver.',
    frame: 'E-07',
    kind: 'approved-copy',
    source: '§Approved copy',
  },
  { text: 'Who I am', frame: 'E-07', kind: 'existing-app', source: 'shipped card title' },
  { text: 'Date of birth', frame: 'E-07', kind: 'existing-app', source: 'shipped detail label' },
  { text: 'Health', frame: 'E-07', kind: 'existing-app', source: 'shipped card title' },
  { text: 'Care instructions', frame: 'E-07', kind: 'wireframe', source: 'A-09/C-11 field' },
  { text: 'Phone', frame: 'E-07', kind: 'existing-app', source: 'shipped detail label' },
  {
    text: 'Medicines are not shown here yet.',
    frame: 'E-07',
    kind: 'approved-copy',
    source: '§Approved copy (documented partial state until Sprint 3)',
  },
  { text: 'Medicines', frame: 'E-07', kind: 'existing-app', source: 'shipped card title' },

  // -------------------------------------------------------------------------
  // Sprint 3, C-02 Medication List (caregiver tab and elder read-only view)
  // -------------------------------------------------------------------------
  { text: 'Medications', frame: 'C-02', kind: 'wireframe', source: 'C-02 app-bar title' },
  { text: 'Meds', frame: 'C-02', kind: 'existing-app', source: 'shipped tab title' },
  { text: 'What you take', frame: 'C-02', kind: 'existing-app', source: 'shipped elder subtitle' },
  {
    text: 'Taken by <name>',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'shipped caregiver subtitle pattern',
  },
  {
    text: 'No older adult linked',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'C-10 empty state',
  },
  { text: 'Loading medicines…', frame: 'C-02', kind: 'existing-app', source: 'shipped loader' },
  {
    text: 'Loading your medicines…',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'shipped elder loader',
  },
  { text: 'Show', frame: 'C-02', kind: 'escalated', source: 'no filter-group label exists' },
  { text: 'Active', frame: 'C-02', kind: 'wireframe', source: 'C-02 filter and card badge' },
  { text: 'Inactive', frame: 'C-02', kind: 'wireframe', source: 'C-02 filter' },
  { text: 'Add medication', frame: 'C-02', kind: 'wireframe', source: 'C-02 primary action' },
  {
    text: 'Editing or deactivating affects future doses only. History remains available.',
    frame: 'C-02',
    kind: 'wireframe',
    source: 'C-02 footer note',
  },
  {
    text: 'No medicines yet',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'shipped empty-state heading',
  },
  {
    text: "Add a medicine to start the older adult's plan.",
    frame: 'C-02',
    kind: 'escalated',
    source: 'the shipped description promised a next dose, which Sprint 3 cannot produce',
  },
  {
    text: 'Your family caregiver adds medicines and schedules here.',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'shipped elder empty state',
  },
  {
    text: 'This list is read-only. It is never changed by an automatic process, and no advice about medicines is generated here.',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'shipped elder read-only note',
  },
  {
    text: 'Status: <label>',
    frame: 'C-02',
    kind: 'existing-app',
    source: 'shipped StatusBadge accessibility pattern',
  },

  // -------------------------------------------------------------------------
  // Sprint 3, C-03 Add / Edit Medication
  // -------------------------------------------------------------------------
  { text: 'Add medication', frame: 'C-03', kind: 'wireframe', source: 'C-03 app-bar title' },
  { text: 'Edit medication', frame: 'C-03', kind: 'spec', source: '§Screens C-03 "Add / Edit"' },
  { text: 'Loading…', frame: 'C-03', kind: 'existing-app', source: 'shared loader copy' },
  { text: 'Medication name', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  { text: 'Strength / form', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  { text: 'Instructions', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  {
    text: 'Form',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the wireframe combines strength and form',
  },
  {
    text: 'Tablet',
    frame: 'C-03',
    kind: 'wireframe',
    source: 'C-03 sample content `500 mg tablet`',
  },
  {
    text: 'Capsule',
    frame: 'C-03',
    kind: 'escalated',
    source: 'no capsule form in the wireframes',
  },
  { text: 'Liquid', frame: 'C-03', kind: 'escalated', source: 'no liquid form in the wireframes' },
  {
    text: 'Other',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the `other` form has no wireframe word',
  },
  {
    text: 'Schedule dates',
    frame: 'C-03',
    kind: 'wireframe',
    source: 'C-03 section SCHEDULE DATES',
  },
  { text: 'Start date', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  { text: 'End date', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  { text: 'No end date', frame: 'C-03', kind: 'wireframe', source: 'C-03 end-date value' },
  {
    text: 'Select date',
    frame: 'C-03',
    kind: 'owner-approved',
    source: 'approved 2026-09-30 (native date picker)',
  },
  {
    text: 'Dose and times',
    frame: 'C-03',
    kind: 'wireframe',
    source: 'C-03 section DOSE AND TIMES',
  },
  { text: 'Dose amount', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  {
    text: 'Unit',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the wireframe folds the unit into the dose',
  },
  {
    text: 'ml',
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 4 list, not in a frame',
  },
  { text: 'mg', frame: 'C-03', kind: 'wireframe', source: 'C-03/C-02 sample content' },
  {
    text: 'Drop',
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 4 list, not in a frame',
  },
  {
    text: 'Puff',
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 4 list, not in a frame',
  },
  {
    text: 'Sachet',
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 4 list, not in a frame',
  },
  {
    text: 'Type the unit',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the `other` unit carries a typed string',
  },
  { text: 'Time', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  {
    text: 'Select time',
    frame: 'C-03',
    kind: 'escalated',
    source: 'no time-picker placeholder exists',
  },
  { text: 'Repeat days', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  { text: 'Sun', frame: 'C-03', kind: 'escalated', source: 'C-04 draws Mon-Fri only' },
  { text: 'Mon', frame: 'C-03', kind: 'wireframe', source: 'C-04 weekday row' },
  { text: 'Tue', frame: 'C-03', kind: 'wireframe', source: 'C-04 weekday row' },
  { text: 'Wed', frame: 'C-03', kind: 'wireframe', source: 'C-04 weekday row' },
  { text: 'Thu', frame: 'C-03', kind: 'wireframe', source: 'C-04 weekday row' },
  { text: 'Fri', frame: 'C-03', kind: 'wireframe', source: 'C-04 weekday row' },
  { text: 'Sat', frame: 'C-03', kind: 'escalated', source: 'C-04 draws Mon-Fri only' },
  { text: 'Grace period', frame: 'C-03', kind: 'wireframe', source: 'C-03 field' },
  { text: '<n> minutes', frame: 'C-03', kind: 'wireframe', source: 'C-03 value `30 minutes`' },
  { text: 'Save medication', frame: 'C-03', kind: 'wireframe', source: 'C-03 primary action' },
  {
    text: 'Stock batch',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-02 build note says stock was out of scope',
  },
  {
    text: 'Track stock for this medication',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the optional batch has no wireframe control',
  },
  {
    text: 'Yes',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the optional batch has no wireframe control',
  },
  {
    text: 'Not now',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the optional batch has no wireframe control',
  },
  {
    text: 'Quantity in the pack',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label',
  },
  {
    text: 'Unit on the pack',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label',
  },
  {
    text: 'Lot number',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label',
  },
  {
    text: 'Expiry date',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label',
  },
  {
    text: 'Low-stock threshold',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label',
  },
  {
    text: 'Refill contact',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label',
  },
  {
    text: 'Enter the medication name',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'Enter the strength and form',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'Enter the instructions',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'Enter the dose amount',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'Choose a unit, or type one for Other',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the `other` unit rule has no wireframe copy',
  },
  {
    text: 'Choose a start date',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'The end date cannot be before the start date',
    frame: 'C-03',
    kind: 'escalated',
    source: 'product-flow §8 rule, no wireframe wording',
  },
  {
    text: 'Choose at least one repeat day',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'Choose a time',
    frame: 'C-03',
    kind: 'escalated',
    source: 'C-03 marks fields required with `*` but supplies no message',
  },
  {
    text: 'Enter the quantity in the pack',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label or message',
  },
  {
    text: 'Enter the unit written on the pack',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label or message',
  },
  {
    text: 'Choose the expiry date',
    frame: 'C-03',
    kind: 'escalated',
    source: 'batch field has no wireframe label or message',
  },
  {
    text: 'This differs from the dose unit, so stock will not reduce automatically.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 5 "warn and store", no wording',
  },
  {
    text: 'This medication already has a schedule for those days and that time',
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 6 recommendation, no wording',
  },
  {
    text: "<name> is already on this elder's plan. You can still save.",
    frame: 'C-03',
    kind: 'escalated',
    source: 'spec open question 6 phrase "already on this elder\'s plan"',
  },
  {
    text: 'Some details are not valid. Check the form and try again.',
    frame: 'C-03',
    kind: 'existing-app',
    source: 'Sprint 2 approved copy, reused verbatim',
  },
  {
    text: 'Only the linked caregiver can change this.',
    frame: 'C-03',
    kind: 'existing-app',
    source: 'Sprint 2 approved copy, reused verbatim',
  },
  {
    text: 'Medication not found',
    frame: 'C-03',
    kind: 'escalated',
    source: 'a hidden row needs an honest empty state',
  },
  {
    text: 'It may have been removed. Go back and try again.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'a hidden row needs an honest empty state',
  },

  // -------------------------------------------------------------------------
  // Sprint 3, C-04 Medication Detail
  // -------------------------------------------------------------------------
  { text: 'Medication details', frame: 'C-04', kind: 'wireframe', source: 'C-04 app-bar title' },
  { text: 'Edit', frame: 'C-04', kind: 'wireframe', source: 'C-04 primary action' },
  { text: 'Instructions', frame: 'C-04', kind: 'wireframe', source: 'C-04 section INSTRUCTIONS' },
  {
    text: 'Active schedule',
    frame: 'C-04',
    kind: 'wireframe',
    source: 'C-04 section ACTIVE SCHEDULE',
  },
  {
    text: 'Recent adherence',
    frame: 'C-04',
    kind: 'wireframe',
    source: 'C-04 section RECENT ADHERENCE',
  },
  { text: 'Deactivate medication', frame: 'C-04', kind: 'wireframe', source: 'C-04 action' },
  {
    text: 'Start: <date> - No end date',
    frame: 'C-04',
    kind: 'wireframe',
    source: 'C-04 plan line',
  },
  {
    text: '<dose> - <n> min grace',
    frame: 'C-04',
    kind: 'wireframe',
    source: 'C-04 schedule line',
  },
  {
    text: 'Activate medication',
    frame: 'C-04',
    kind: 'escalated',
    source: 'C-04 draws the deactivate action only',
  },
  {
    text: 'Stock',
    frame: 'C-04',
    kind: 'escalated',
    source: 'the wireframes draw no stock section',
  },
  {
    text: 'Set as active',
    frame: 'C-04',
    kind: 'escalated',
    source: 'the active-batch action has no wireframe wording',
  },
  {
    text: 'No active schedule. Add a schedule to activate the plan.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'the draft state needs an honest note',
  },
  {
    text: 'No stock batch recorded.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'the batch is optional',
  },
  {
    text: 'Dose history is not shown here yet.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'the documented partial state until Sprint 4, in the Sprint 2 partial-state voice',
  },
  {
    text: 'Future doses stop. The medicine and its history stay in the plan.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'the confirm description has no wireframe wording',
  },
  {
    text: 'Try again',
    frame: 'C-04',
    kind: 'existing-app',
    source: 'shipped ScreenError action',
  },
  { text: 'Cancel', frame: 'C-04', kind: 'existing-app', source: 'shipped ConfirmDialog label' },

  // -------------------------------------------------------------------------
  // Sprint 3, data-layer errors (rendered by C-02/C-03/C-04 banners)
  // -------------------------------------------------------------------------
  {
    text: 'Could not load the medicines.',
    frame: 'C-02',
    kind: 'escalated',
    source: 'new loader failure message',
  },
  {
    text: 'Could not load the medicine.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'new loader failure message',
  },
  {
    text: 'Could not load the schedules.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'new loader failure message',
  },
  {
    text: 'Could not load the stock batches.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'new loader failure message',
  },
  {
    text: 'Could not save the medicine.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'new RPC fallback message',
  },
  {
    text: 'Could not change the medicine.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'new RPC fallback message',
  },
  {
    text: 'Could not save the schedule.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'new RPC fallback message',
  },
  {
    text: 'Could not change the schedule.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'new RPC fallback message',
  },
  {
    text: 'Could not save the stock batch.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'new RPC fallback message',
  },
  {
    text: 'Could not change the stock batch.',
    frame: 'C-04',
    kind: 'escalated',
    source: 'new RPC fallback message',
  },
  {
    text: 'That medicine no longer exists. Refresh and try again.',
    frame: 'C-03',
    kind: 'escalated',
    source: 'the P0002 not-found mapping',
  },
];

/**
 * The strings with no approved source and no owner ruling yet. Sprint 2 says such a string "is
 * escalated to the owner, never invented". The owner approved all 18 entries raised for Sprint 2
 * on 2026-09-30 (they now read `owner-approved`), and approved the two added by the native date
 * picker the same day.
 *
 * Sprint 3's strings are the second batch. The owner ruled on 2026-09-30 that they be written,
 * listed here and approved in bulk, so this list is the pending set rather than an empty mechanism:
 * the medication frames supply their own labels, but the batch section, the validation sentences
 * and the RPC fallbacks have no approved source.
 */
export const COPY_ESCALATIONS: CopyEntry[] = COPY_SOURCES.filter(
  (entry) => entry.kind === 'escalated',
);
