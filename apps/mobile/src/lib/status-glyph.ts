import type { StatusIcon } from '@eldercare/shared';

/**
 * Interim glyph map. The standard requires an icon *and* a text label for every status
 * (`docs/02-ui-ux-standard.md` section 6), but this build ships no icon font — adding one is a
 * dependency decision, so the icon slot is filled with a plain-text glyph from the platform
 * font until that is approved. The accessible name always comes from the label, never the glyph.
 */
const GLYPHS: Record<StatusIcon, string> = {
  check: '\u2713',
  close: '\u2715',
  'alert-circle': '!',
  'alert-triangle': '!',
  clock: '\u25F7',
  calendar: '\u25A6',
  'calendar-check': '\u25A6',
  'calendar-x': '\u25A6',
  alarm: '\u23F0',
  sync: '\u21BB',
  cube: '\u25A3',
  'trend-down': '\u2198',
  hourglass: '\u231B',
  archive: '\u25A4',
  file: '\u25A4',
  help: '?',
  home: '\u2302',
  stethoscope: '\u271A',
};

export function statusGlyph(icon: StatusIcon): string {
  return GLYPHS[icon] ?? '?';
}
