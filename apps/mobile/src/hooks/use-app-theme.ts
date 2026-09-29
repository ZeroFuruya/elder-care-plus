import type { StatusTone } from '@eldercare/shared';
import { useColorScheme } from 'react-native';

import {
  darkColors,
  darkElevation,
  darkGradients,
  darkStatusColors,
  lightColors,
  lightElevation,
  lightGradients,
  lightStatusColors,
  type AppElevation,
  type AppGradients,
  type AppThemeColors,
} from '@/constants/theme';

export type AppColorScheme = 'light' | 'dark';

export interface AppTheme {
  scheme: AppColorScheme;
  colors: AppThemeColors;
  statusColors: Record<StatusTone, string>;
  /** Soft-UI shadow pairs, per theme (see `AppElevation` in `constants/theme`). */
  elevation: AppElevation;
  /** Soft-UI surface gradient stops, per theme (see `AppGradients` in `constants/theme`). */
  gradients: AppGradients;
}

/**
 * The colours for the active colour scheme.
 *
 * New screens must read colours from here instead of importing `colors` (the deprecated
 * light-only alias), so they work in both light and dark mode
 * (docs/02-ui-ux-standard.md §5.3).
 *
 * Today `app.json` pins `userInterfaceStyle: "light"`, so this resolves to the light set; the
 * dark set lands as screens finish migrating and the config flips to `automatic`. Keep the
 * `scheme` fallback: `useColorScheme()` may return `null` before the OS reports a value.
 */
export function useAppTheme(): AppTheme {
  const scheme: AppColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  if (scheme === 'dark') {
    return {
      scheme,
      colors: darkColors,
      statusColors: darkStatusColors,
      elevation: darkElevation,
      gradients: darkGradients,
    };
  }
  return {
    scheme,
    colors: lightColors,
    statusColors: lightStatusColors,
    elevation: lightElevation,
    gradients: lightGradients,
  };
}
