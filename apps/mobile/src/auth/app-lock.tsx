import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  INITIAL_UNLOCK_ATTEMPTS,
  parseAppLockRecord,
  registerUnlockFailure,
  shouldLockOnResume,
  type AppLockRecord,
  type UnlockAttemptState,
} from '@eldercare/shared';

import { useAuth } from '@/auth/auth-context';

/**
 * App lock (Sprint 11, owner decision 2026-11-02).
 *
 * The session already lives in the device keystore, but a phone left on a table stays signed in.
 * This provider locks the **screen** after `APP_LOCK_TIMEOUT_MS` in the background (and on a cold
 * start when the last session is older than that) and requires a fresh password or the device
 * biometric to continue. It never signs the user out, so nothing is lost.
 *
 * The policy itself is in `@eldercare/shared` (`app-lock.ts`) and unit-tested there; this file is
 * only the React Native plumbing.
 */

const BACKGROUNDED_KEY = 'eldercare.lock.backgrounded';

export interface BiometricState {
  available: boolean;
  /** "Fingerprint", "Face", "Biometric" or "Password" - shown as text, never as an icon alone. */
  label: string;
}

interface AppLockValue {
  locked: boolean;
  /** Locks immediately, for the Profile "Lock now" control and the demo. */
  lockNow: () => void;
  /** Called by the lock screen after a successful password or biometric check. */
  unlock: () => void;
  /** Wrong passwords recorded since the last reset (0 while a cooldown runs). */
  failedAttempts: number;
  /** Epoch ms until which the keypad refuses further attempts, or null. */
  cooldownUntil: number | null;
  /** Records one wrong password and starts the cooldown on the fifth. */
  registerFailure: () => void;
  biometric: BiometricState;
}

const AppLockContext = createContext<AppLockValue | null>(null);

async function saveBackgroundedAt(userId: string): Promise<void> {
  try {
    const record: AppLockRecord = { userId, at: Date.now() };
    await SecureStore.setItemAsync(BACKGROUNDED_KEY, JSON.stringify(record));
  } catch {
    // Failing to persist only weakens a cold-start lock; it must never crash a running app.
  }
}

async function clearBackgroundedAt(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BACKGROUNDED_KEY);
  } catch {
    // Nothing to do: an unreadable record is rejected by the parser on the next read.
  }
}

async function readBackgroundedAt(): Promise<AppLockRecord | null> {
  try {
    return parseAppLockRecord(await SecureStore.getItemAsync(BACKGROUNDED_KEY));
  } catch {
    return null;
  }
}

/**
 * Keyed by user id, so every sign-in starts from a clean lock state and a previous account's
 * record can never lock the next one. Keying is what lets the effect below stay free of
 * "reset on user change" state writes.
 */
function AppLockState({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [biometric, setBiometric] = useState<BiometricState>({
    available: false,
    label: 'Password',
  });
  const [attempts, setAttempts] = useState<UnlockAttemptState>(INITIAL_UNLOCK_ATTEMPTS);

  // Cold start: the JS context may have been killed while the app was backgrounded for hours.
  useEffect(() => {
    let active = true;

    void (async () => {
      const record = await readBackgroundedAt();
      if (!active || !record) return;

      if (record.userId !== userId) {
        await clearBackgroundedAt();
        return;
      }

      if (shouldLockOnResume({ now: Date.now(), backgroundedAt: record.at })) {
        setLocked(true);
        return;
      }

      await clearBackgroundedAt();
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  // Background/foreground: record the time, then decide on the way back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        void saveBackgroundedAt(userId);
        return;
      }

      if (state !== 'active') return;

      void (async () => {
        const record = await readBackgroundedAt();
        if (!record) return;

        if (record.userId !== userId) {
          await clearBackgroundedAt();
          return;
        }

        if (shouldLockOnResume({ now: Date.now(), backgroundedAt: record.at })) {
          setLocked(true);
          return;
        }

        await clearBackgroundedAt();
      })();
    });

    return () => subscription.remove();
  }, [userId]);

  // What the device can actually do; queried once per session, never assumed.
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [hasHardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);

        if (!active) return;
        if (!hasHardware || !enrolled) {
          setBiometric({ available: false, label: 'Password' });
          return;
        }

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (!active) return;

        const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
        const label =
          hasFingerprint && !hasFace
            ? 'Fingerprint'
            : hasFace && !hasFingerprint
              ? 'Face'
              : 'Biometric';

        setBiometric({ available: true, label });
      } catch {
        if (active) setBiometric({ available: false, label: 'Password' });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const lockNow = useCallback(() => {
    setLocked(true);
    void saveBackgroundedAt(userId);
  }, [userId]);

  const unlock = useCallback(() => {
    setAttempts(INITIAL_UNLOCK_ATTEMPTS);
    setLocked(false);
    void clearBackgroundedAt();
  }, []);

  /**
   * One wrong password. The transition itself is in `@eldercare/shared` (`registerUnlockFailure`)
   * and unit-tested; the functional update is what makes rapid submissions safe, because React
   * hands the updater the latest state instead of a render-time snapshot.
   */
  const registerFailure = useCallback(() => {
    setAttempts((current) => registerUnlockFailure(current, Date.now()));
  }, []);

  const value = useMemo<AppLockValue>(
    () => ({
      locked,
      lockNow,
      unlock,
      failedAttempts: attempts.failedAttempts,
      cooldownUntil: attempts.cooldownUntil,
      registerFailure,
      biometric,
    }),
    [attempts, biometric, lockNow, locked, registerFailure, unlock],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user)
    return <AppLockContext.Provider value={SIGNED_OUT}>{children}</AppLockContext.Provider>;

  return (
    <AppLockState key={user.id} userId={user.id}>
      {children}
    </AppLockState>
  );
}

/** A signed-out app has nothing to lock; this keeps `useAppLock` usable on the auth screens. */
const SIGNED_OUT: AppLockValue = {
  locked: false,
  lockNow: () => undefined,
  unlock: () => undefined,
  failedAttempts: 0,
  cooldownUntil: null,
  registerFailure: () => undefined,
  biometric: { available: false, label: 'Password' },
};

export function useAppLock(): AppLockValue {
  const value = useContext(AppLockContext);
  if (!value) throw new Error('AppLockProvider is missing from the root layout.');
  return value;
}
