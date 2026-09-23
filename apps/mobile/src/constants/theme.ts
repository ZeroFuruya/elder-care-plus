/**
 * Shared design tokens for ElderCare+.
 *
 * Product hard rule: never convey status (stock / expiry / dose) by color alone.
 * Every colored status must ship a text and/or icon label alongside it.
 * Accessibility: 48 dp minimum touch targets, 56 dp for `Mark as taken`.
 * See docs/00-product-flow.md sections 3 and 8.
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
} as const;

export const radius = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;
