import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Local device notifications for help requests (docs/specs/sprint-8.md, OD4).
 *
 * The owner asked for in-app **and** device notifications. There is no remote push service in the
 * project (budget and no push server), so this presents a **local** notification when the app is
 * running and receives a help-request event over Realtime. It is deliberately defensive: every
 * entry point fails soft, so a denied permission or an unavailable module never crashes a screen.
 *
 * Expo Go cannot load `expo-notifications` on Android since SDK 53 (remote push was removed) and
 * importing it throws, which would take the whole route module down with it (the family layout
 * imports this). So the module is imported **lazily** and only outside Expo Go; in Expo Go, on
 * web, or when the native module is missing, every entry point is a silent no-op. Device
 * notifications therefore work in the preview APK / a development build, not in Expo Go.
 *
 * This is the only place the app talks to `expo-notifications`.
 */

type NotificationsModule = typeof import('expo-notifications');

const ANDROID_CHANNEL_ID = 'help-requests';

/**
 * Expo Go specifically — not a development build (`executionEnvironment` is `storeClient` for both,
 * so it cannot be used to tell them apart). The dynamic import's `catch` is the safety net if this
 * ever stops being reported.
 */
const isExpoGo = Constants.appOwnership === 'expo';

let modulePromise: Promise<NotificationsModule | null> | null = null;
let permissionPromise: Promise<boolean> | null = null;
let androidChannelReady = false;

/** Load `expo-notifications` once, or resolve `null` where it cannot be used. */
function loadNotifications(): Promise<NotificationsModule | null> {
  if (modulePromise) return modulePromise;
  if (Platform.OS === 'web' || isExpoGo) {
    modulePromise = Promise.resolve(null);
    return modulePromise;
  }
  modulePromise = import('expo-notifications')
    .then((loaded) => {
      loaded.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          // On Android a silent handler suppresses the heads-up banner, so a help request plays a sound.
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return loaded;
    })
    .catch(() => null);
  return modulePromise;
}

/**
 * True when the platform could present a local notification. Best-effort and synchronous; the
 * module is loaded when a notification is actually presented.
 */
export function deviceNotificationsSupported(): boolean {
  return Platform.OS !== 'web' && !isExpoGo;
}

/**
 * Ask once per app lifetime. Returns `false` rather than throwing when permission is refused or the
 * platform cannot answer.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
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
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    if (Platform.OS === 'android' && !androidChannelReady) {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Help requests',
        importance: Notifications.AndroidImportance.HIGH,
      });
      androidChannelReady = true;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      // On Android, a channel-aware trigger delivers immediately on that channel; iOS uses null.
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
    });
  } catch {
    // A missing native module on an old build must never surface on the help screens.
  }
}
