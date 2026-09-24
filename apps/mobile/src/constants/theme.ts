import type { StatusTone } from '@eldercare/shared';

/**
 * Shared design tokens for ElderCare+.
 *
 * Product hard rule: never convey status (stock / expiry / dose) by color alone.
 * Every colored status must ship a text and/or icon label alongside it.
 * Accessibility: 48 dp minimum touch targets, 56 dp for `Mark as taken`.
 *
 * Normative source: docs/02-ui-ux-standard.md (sections 2, 5 and 6). Section 5.1 records the
 * approved brand palette this file does **not** yet match — open decision D9 / conflict R8.
 */

export const colors = {
  background: '#F6F8FA',
  surface: '#FFFFFF',
  text: '#101828',
  textMuted: '#5A6472',
  primary: '#1D6FE0',
  border: '#D6DDE5',
  danger: '#B42318',
  warning: '#8A5A00',
  success: '#17683C',
} as const;

/**
 * The one and only tone -> colour mapping (docs/02-ui-ux-standard.md section 6).
 *
 * A screen turns a status value into a `tone` in `@eldercare/shared`'s status presentations, and
 * turns that tone into a colour here. A screen that switches on a status value to choose a
 * colour is a defect. Each value passes 4.5:1 on both `background` and `surface`; that is
 * verified by `pnpm run check:contrast`.
 */
export const statusColors: Record<StatusTone, string> = {
  neutral: colors.textMuted,
  attention: colors.warning,
  danger: colors.danger,
  success: colors.success,
};

/** Minimum interactive sizes in density-independent pixels. */
export const touchTarget = {
  /** Every tappable control. */
  min: 48,
  /** The elder's `Mark as taken` action. */
  primaryAction: 56,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Deliberately large base sizes for older readers. */
export const fontSize = {
  caption: 15,
  body: 18,
  heading: 20,
  title: 26,
  /**
   * Bottom-navigation labels only. The tabs sit at 360/5 = 72 dp wide, where the 15 dp caption
   * would clip a 9-character label ("Emergency"), so chrome gets one documented size below the
   * 15 dp content floor (docs/02-ui-ux-standard.md section 2).
   */
  tabLabel: 13,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/** Line heights for the sizes in `fontSize` (docs/02-ui-ux-standard.md section 2). */
export const lineHeight = {
  caption: 22,
  body: 26,
  heading: 28,
  title: 34,
} as const;
