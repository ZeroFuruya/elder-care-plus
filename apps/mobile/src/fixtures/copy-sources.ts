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
 *   implementer proposes it and `COPY_ESCALATIONS` is exactly this list; it is empty today.
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
  frame: 'A-09' | 'C-10' | 'C-11' | 'E-07' | 'Profile tab';
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
  { text: 'YYYY-MM-DD', frame: 'A-09', kind: 'owner-approved', source: 'date format hint' },
  {
    text: 'Enter the date as YYYY-MM-DD.',
    frame: 'A-09',
    kind: 'owner-approved',
    source: '§11 requires an inline error; the wording is proposed',
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
];

/**
 * The strings with no approved source and no owner ruling yet. Sprint 2 says such a string "is
 * escalated to the owner, never invented". The owner approved all 18 entries raised for Sprint 2
 * on 2026-09-30 (they now read `owner-approved`), so this list is empty; it stays as the mechanism
 * for the next unapproved string.
 */
export const COPY_ESCALATIONS: CopyEntry[] = COPY_SOURCES.filter(
  (entry) => entry.kind === 'escalated',
);
