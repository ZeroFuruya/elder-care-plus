import type { StatusTone } from '@eldercare/shared';

/**
 * Shared design tokens for ElderCare+.
 *
 * Product hard rule: never convey status (stock / expiry / dose) by color alone.
 * Every colored status must ship a text and/or icon label alongside it.
 * Accessibility: 48 dp minimum touch targets, 56 dp for `Mark as taken`.
 *
 * Normative sources:
 * - Visual identity: `docs/UI_theme_palette.pptx.pdf` (palette, logo, icon set, buttons).
 * - Rules: `docs/02-ui-ux-standard.md` (§5 contrast, §5.3 light/dark token sets, §6 status).
 *
 * The app supports **light and dark** mode. Screens must read colours from `useAppTheme()`
 * rather than importing one palette directly; `colors` below is the light-only compatibility
 * alias kept while screens migrate.
 */

/**
 * The approved brand palette (docs/02-ui-ux-standard.md §5.1; the palette PDF's COLOR SCHEME
 * page). These are **fills and surfaces**, never body text: most fail 4.5:1 as text on a light
 * background (§5.2). Pair a bright fill with `onPrimaryFill` (Navy), not white.
 */
export const brand = {
  teal: '#49C3B2',
  blue: '#4A8FD8',
  purple: '#9B6FE3',
  lavender: '#C69AF6',
  mint: '#8DE0D1',
  skyBlue: '#78B7F3',
  slateBlue: '#5A74A6',
  navy: '#24436D',
  white: '#FFFFFF',
  offWhite: '#F8FAFC',
  lightGray: '#E8EDF4',
  mediumGray: '#B6C0CE',
  darkGray: '#667085',
  charcoal: '#344054',
} as const;

/**
 * Semantic colour roles, resolved per theme. A screen must never switch on a brand name
 * (`brand.teal`) to pick a colour — it picks a role (`primaryFill`) and the theme supplies
 * the value. Verified by `pnpm run check:contrast`.
 */
export interface AppThemeColors {
  /** App background. */
  background: string;
  /** Cards and raised surfaces. */
  surface: string;
  /** Recessed rows, selected chips, subtle fills. */
  surfaceMuted: string;
  /** Decorative dividers and boundaries (never the only boundary of a control). */
  border: string;
  /** Control outlines and disabled fills. */
  borderStrong: string;
  /** Primary body and title text. */
  text: string;
  /** High-emphasis titles. */
  textTitle: string;
  /** Meta only: timestamps and helper text, never a medicine name, dose or instruction. */
  textMuted: string;
  /** Text on a `primaryFill` or `danger` fill. */
  textInverse: string;
  /** Interactive text and tint (links, active tab). Passes AA as text. */
  primary: string;
  /** Bright brand fill for the primary action (Teal). Pair with `onPrimaryFill`. */
  primaryFill: string;
  /** Label colour **on** `primaryFill`. */
  onPrimaryFill: string;
  /** Caregiver/report accent fill (Purple). */
  accent: string;
  /** Soft caregiver surface (Lavender). */
  accentSoft: string;
  /** Informational accent — graphics and large text only. */
  info: string;
  /** Focus ring. */
  focus: string;
  /** Missed/error. Always with a text or icon label. */
  danger: string;
  /** Caution. Always with a text or icon label. */
  warning: string;
  /** Taken/positive. Always with a text or icon label. */
  success: string;
}

export const lightColors: AppThemeColors = {
  background: brand.offWhite,
  surface: brand.white,
  surfaceMuted: brand.lightGray,
  border: brand.lightGray,
  borderStrong: brand.mediumGray,
  text: brand.charcoal,
  textTitle: brand.navy,
  textMuted: brand.darkGray,
  textInverse: brand.white,
  primary: brand.navy,
  primaryFill: brand.teal,
  onPrimaryFill: brand.navy,
  accent: brand.purple,
  accentSoft: brand.lavender,
  info: brand.blue,
  focus: brand.blue,
  danger: '#B42318',
  warning: '#9A5B13',
  success: '#1F7A4D',
};

/**
 * Deep-navy dark set, derived from the same brand palette (the source PDF has no dark page).
 * Owner-approved 2026-09-29. Status tones are the lightened variants so they still clear AA
 * on a dark surface.
 */
export const darkColors: AppThemeColors = {
  background: '#0F1620',
  surface: '#18212E',
  surfaceMuted: '#212C3B',
  border: '#2A3646',
  borderStrong: '#3A4757',
  text: '#E2E8F0',
  textTitle: '#F1F5F9',
  textMuted: '#A9B6C6',
  textInverse: '#0F1620',
  primary: '#78B7F3',
  primaryFill: brand.teal,
  onPrimaryFill: '#16202C',
  accent: '#A78BFA',
  accentSoft: brand.lavender,
  info: '#78B7F3',
  focus: '#78B7F3',
  danger: '#F87171',
  warning: '#FBBF24',
  success: '#4ADE80',
};

/**
 * The one and only tone -> colour mapping (docs/02-ui-ux-standard.md §6), per theme.
 *
 * A screen turns a status value into a `tone` in `@eldercare/shared`'s status presentations,
 * and turns that tone into a colour here. A screen that switches on a status value to choose
 * a colour is a defect. Each value passes 4.5:1 on both `background` and `surface` of its
 * theme; that is verified by `pnpm run check:contrast`.
 */
export const lightStatusColors: Record<StatusTone, string> = {
  neutral: lightColors.textMuted,
  attention: lightColors.warning,
  danger: lightColors.danger,
  success: lightColors.success,
};

export const darkStatusColors: Record<StatusTone, string> = {
  neutral: darkColors.textMuted,
  attention: darkColors.warning,
  danger: darkColors.danger,
  success: darkColors.success,
};

/**
 * @deprecated Light-theme alias kept so existing screens keep working while they migrate to
 * `useAppTheme()` (light + dark). New code imports `useAppTheme()`; do not read `colors` in
 * new components.
 */
export const colors = lightColors;

/** @deprecated see `colors`. Use `useAppTheme().statusColors`. */
export const statusColors = lightStatusColors;

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
