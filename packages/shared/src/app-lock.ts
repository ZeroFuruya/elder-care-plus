/**
 * The app-lock policy (Sprint 11).
 *
 * The mobile app locks itself when it has been **in the background** for longer than
 * `APP_LOCK_TIMEOUT_MS`, and again on a cold start when the last session is older than that.
 * It deliberately does **not** lock on foreground idle: the lock exists to protect a phone left
 * unattended, not to interrupt someone reading a medication screen (owner decision 2026-11-02).
 *
 * The policy lives here, free of React Native, so the boundary cases are unit-tested in
 * `app-lock.test.ts` instead of being discovered on stage.
 */

/** How long the app may stay in the background before it locks. */
export const APP_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

/** Password attempts allowed on the lock screen before it pauses. */
export const APP_LOCK_MAX_ATTEMPTS = 5;

/** How long the lock screen refuses further password attempts after too many failures. */
export const APP_LOCK_COOLDOWN_MS = 30 * 1000;

/** What the app persists about the backgrounded session. */
export interface AppLockRecord {
  /** The user whose session was backgrounded, so a different account never inherits a stale lock. */
  userId: string;
  /** Epoch milliseconds when the app went to the background (or was locked on purpose). */
  at: number;
}

/** Narrows an untrusted SecureStore value; a corrupt record must never unlock or crash the app. */
export function parseAppLockRecord(value: string | null): AppLockRecord | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Partial<AppLockRecord>;
  if (typeof record.userId !== 'string' || !record.userId) return null;
  if (typeof record.at !== 'number' || !Number.isFinite(record.at) || record.at <= 0) return null;

  return { userId: record.userId, at: record.at };
}

/**
 * Should the lock screen appear when the app comes back to the foreground?
 *
 * `backgroundedAt` is `null` when the app never recorded a background event (first run, or the
 * last check cleared it), so an app that stayed in the foreground never locks.
 */
export function shouldLockOnResume(input: {
  now: number;
  backgroundedAt: number | null;
  timeoutMs?: number;
}): boolean {
  if (input.backgroundedAt === null) return false;
  if (!Number.isFinite(input.backgroundedAt) || input.backgroundedAt <= 0) return false;

  const timeoutMs = input.timeoutMs ?? APP_LOCK_TIMEOUT_MS;
  return input.now - input.backgroundedAt >= timeoutMs;
}

/**
 * Cooldown applied **after** a failed attempt is recorded. The fifth wrong password starts the
 * pause; earlier attempts return 0 so an ordinary typo never blocks the user.
 */
export function unlockCooldownMs(failedAttempts: number): number {
  return failedAttempts >= APP_LOCK_MAX_ATTEMPTS ? APP_LOCK_COOLDOWN_MS : 0;
}

/** The lock screen's attempt bookkeeping, kept in one value so a render cannot mix two counters. */
export interface UnlockAttemptState {
  failedAttempts: number;
  cooldownUntil: number | null;
}

export const INITIAL_UNLOCK_ATTEMPTS: UnlockAttemptState = {
  failedAttempts: 0,
  cooldownUntil: null,
};

/**
 * Records one wrong password. A state transition rather than a timer: the lock screen already ticks
 * once a second, so an expired pause hides itself when `cooldownRemainingMs` reaches 0.
 */
export function registerUnlockFailure(state: UnlockAttemptState, now: number): UnlockAttemptState {
  const failed = state.failedAttempts + 1;
  const cooldown = unlockCooldownMs(failed);

  if (cooldown === 0) {
    return { failedAttempts: failed, cooldownUntil: state.cooldownUntil };
  }

  return { failedAttempts: 0, cooldownUntil: now + cooldown };
}

/** Milliseconds left on the pause, never negative. */
export function cooldownRemainingMs(cooldownUntil: number | null, now: number): number {
  if (!cooldownUntil) return 0;
  return Math.max(0, cooldownUntil - now);
}
