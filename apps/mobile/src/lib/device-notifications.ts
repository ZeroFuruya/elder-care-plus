import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local device notifications for help requests (docs/specs/sprint-8.md, OD4).
 *
 * The owner asked for in-app **and** device notifications. There is no remote push service in the
 * project (budget and no push server), so this presents a **local** notification when the app is
 * running and receives a help-request event over Realtime. It is deliberately defensive: every
 * entry point fails soft, so a denied permission or an unavailable module never crashes a screen.
 *
 * This is the only place the app talks to `expo-notifications`.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // On Android a silent handler suppresses the heads-up banner, so a help request plays a sound.
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL_ID = 'help-requests';

let permissionPromise: Promise<boolean> | null = null;
let androidChannelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || androidChannelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Help requests',
    importance: Notifications.AndroidImportance.HIGH,
  });
  androidChannelReady = true;
}

/** True only when the platform can present a local notification. */
export function deviceNotificationsSupported(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Ask once per app lifetime. Returns `false` rather than throwing when permission is refused or the
 * platform cannot answer.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!deviceNotificationsSupported()) return false;
  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return true;
        const requested = await Notifications.requestPermissionsAsync();
        return requested.granted;
      } catch {
        return false;
      }
    })();
  }
  return permissionPromise;
}

/** Present a local help-request notification. A refusal or failure is silent by design. */
export async function presentHelpNotification(title: string, body: string): Promise<void> {
  if (!deviceNotificationsSupported()) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      // On Android, a channel-aware trigger delivers immediately on that channel; iOS uses null.
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
    });
  } catch {
    // A missing native module on an old build must never surface on the help screens.
  }
}
