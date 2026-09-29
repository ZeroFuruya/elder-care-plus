import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { StatusIcon } from '@eldercare/shared';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, type ColorValue } from 'react-native';

/**
 * The app's one icon component.
 *
 * `docs/02-ui-ux-standard.md` §6 requires an icon *and* a text label for every status, and
 * `@eldercare/shared` already carries the semantic `StatusIcon` key ("never a font glyph:
 * packages/shared stays free of icon libraries"). This component is where that semantic name
 * becomes a real icon — the platform's own family, one family per platform
 * (`expo-native-ui` icons guidance, `docs/UI_theme_palette.pptx.pdf` for the icon set):
 *
 * - Android → Material Icons, via `@expo/vector-icons`
 * - iOS → SF Symbols, via `expo-symbols`
 *
 * Icons are decorative: the meaning is always in the adjacent text label, so the icon is hidden
 * from assistive technology and the label carries the accessible name.
 */
export type AppIconName =
  | StatusIcon
  | 'add'
  | 'back'
  | 'bell'
  | 'checkbox-off'
  | 'checkbox-on'
  | 'collapse'
  | 'expand'
  | 'forward'
  | 'info'
  | 'medication'
  | 'person'
  | 'phone'
  | 'radio-off'
  | 'radio-on'
  | 'reports';

/** The SF Symbol name type, taken from the installed package so invalid names fail typecheck. */
type SfSymbolName = SymbolViewProps['name'];
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface IconSpec {
  md: MaterialIconName;
  sf: SfSymbolName;
}

const ICONS: Record<AppIconName, IconSpec> = {
  add: { md: 'add', sf: 'plus' },
  alarm: { md: 'alarm', sf: 'alarm' },
  'alert-circle': { md: 'error-outline', sf: 'exclamationmark.circle' },
  'alert-triangle': { md: 'warning', sf: 'exclamationmark.triangle' },
  archive: { md: 'archive', sf: 'archivebox' },
  back: { md: 'chevron-left', sf: 'chevron.left' },
  bell: { md: 'notifications', sf: 'bell' },
  calendar: { md: 'calendar-today', sf: 'calendar' },
  'calendar-check': { md: 'event-available', sf: 'calendar.badge.checkmark' },
  'calendar-x': { md: 'event-busy', sf: 'calendar.badge.exclamationmark' },
  'checkbox-off': { md: 'check-box-outline-blank', sf: 'square' },
  'checkbox-on': { md: 'check-box', sf: 'checkmark.square.fill' },
  check: { md: 'check', sf: 'checkmark' },
  clock: { md: 'schedule', sf: 'clock' },
  close: { md: 'close', sf: 'xmark' },
  collapse: { md: 'expand-less', sf: 'chevron.up' },
  cube: { md: 'inventory-2', sf: 'shippingbox' },
  expand: { md: 'expand-more', sf: 'chevron.down' },
  file: { md: 'description', sf: 'doc.text' },
  forward: { md: 'chevron-right', sf: 'chevron.right' },
  help: { md: 'help-outline', sf: 'questionmark.circle' },
  home: { md: 'home', sf: 'house' },
  hourglass: { md: 'hourglass-empty', sf: 'hourglass' },
  info: { md: 'info-outline', sf: 'info.circle' },
  medication: { md: 'medication', sf: 'pills' },
  person: { md: 'person', sf: 'person' },
  phone: { md: 'call', sf: 'phone' },
  'radio-off': { md: 'radio-button-unchecked', sf: 'circle' },
  'radio-on': { md: 'radio-button-checked', sf: 'largecircle.fill.circle' },
  reports: { md: 'analytics', sf: 'chart.bar' },
  stethoscope: { md: 'medical-services', sf: 'stethoscope' },
  sync: { md: 'sync', sf: 'arrow.clockwise' },
  'trend-down': { md: 'trending-down', sf: 'arrow.down.right' },
};

export interface IconProps {
  name: AppIconName;
  /** Size in dp. Match it to the weight of the adjacent text. */
  size?: number;
  color?: ColorValue;
  /**
   * Set only when the icon is the sole carrier of meaning. Status icons must keep their text
   * label instead (`docs/02-ui-ux-standard.md` §6), so this stays off for them.
   */
  accessibilityLabel?: string;
}

export function Icon({ name, size = 20, color, accessibilityLabel }: IconProps) {
  const spec = ICONS[name];

  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={spec.sf}
        size={size}
        tintColor={color}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={accessibilityLabel === undefined}
      />
    );
  }

  return (
    <MaterialIcons
      name={spec.md}
      size={size}
      color={color}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined}
    />
  );
}
