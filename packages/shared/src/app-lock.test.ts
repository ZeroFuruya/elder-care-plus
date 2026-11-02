import { describe, expect, it } from 'vitest';

import {
  APP_LOCK_COOLDOWN_MS,
  APP_LOCK_MAX_ATTEMPTS,
  APP_LOCK_TIMEOUT_MS,
  INITIAL_UNLOCK_ATTEMPTS,
  cooldownRemainingMs,
  parseAppLockRecord,
  registerUnlockFailure,
  shouldLockOnResume,
  unlockCooldownMs,
} from './app-lock';

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = 1_800_000_000_000;

describe('shouldLockOnResume', () => {
  it('locks once the app has been in the background for the full timeout', () => {
    expect(shouldLockOnResume({ now: NOW, backgroundedAt: NOW - APP_LOCK_TIMEOUT_MS })).toBe(true);
  });

  it('does not lock one millisecond before the timeout', () => {
    expect(shouldLockOnResume({ now: NOW, backgroundedAt: NOW - APP_LOCK_TIMEOUT_MS + 1 })).toBe(
      false,
    );
  });

  it('does not lock when the app was never backgrounded', () => {
    expect(shouldLockOnResume({ now: NOW, backgroundedAt: null })).toBe(false);
  });

  it('never locks on a corrupt timestamp (a stuck lock would be worse than an unlocked app)', () => {
    expect(shouldLockOnResume({ now: NOW, backgroundedAt: 0 })).toBe(false);
    expect(shouldLockOnResume({ now: NOW, backgroundedAt: Number.NaN })).toBe(false);
  });

  it('can use a shorter timeout in tests without changing the shipped default', () => {
    expect(shouldLockOnResume({ now: NOW, backgroundedAt: NOW - 1_000, timeoutMs: 1_000 })).toBe(
      true,
    );
  });
});

describe('parseAppLockRecord', () => {
  it('round-trips a valid record', () => {
    expect(parseAppLockRecord(JSON.stringify({ userId: USER, at: NOW }))).toEqual({
      userId: USER,
      at: NOW,
    });
  });

  it('rejects missing, malformed and partial records instead of throwing', () => {
    expect(parseAppLockRecord(null)).toBeNull();
    expect(parseAppLockRecord('')).toBeNull();
    expect(parseAppLockRecord('not json')).toBeNull();
    expect(parseAppLockRecord('null')).toBeNull();
    expect(parseAppLockRecord('[]')).toBeNull();
    expect(parseAppLockRecord(JSON.stringify({ at: NOW }))).toBeNull();
    expect(parseAppLockRecord(JSON.stringify({ userId: USER }))).toBeNull();
    expect(parseAppLockRecord(JSON.stringify({ userId: '', at: NOW }))).toBeNull();
    expect(parseAppLockRecord(JSON.stringify({ userId: USER, at: 0 }))).toBeNull();
    expect(parseAppLockRecord(JSON.stringify({ userId: USER, at: 'now' }))).toBeNull();
  });
});

describe('unlockCooldownMs', () => {
  it('does not pause before the fifth failure', () => {
    for (let attempts = 0; attempts < APP_LOCK_MAX_ATTEMPTS; attempts += 1) {
      expect(unlockCooldownMs(attempts)).toBe(0);
    }
  });

  it('pauses once the fifth failure is recorded', () => {
    expect(unlockCooldownMs(APP_LOCK_MAX_ATTEMPTS)).toBe(APP_LOCK_COOLDOWN_MS);
    expect(unlockCooldownMs(APP_LOCK_MAX_ATTEMPTS + 3)).toBe(APP_LOCK_COOLDOWN_MS);
  });
});

describe('registerUnlockFailure', () => {
  it('counts the first four wrong passwords without pausing', () => {
    let state = INITIAL_UNLOCK_ATTEMPTS;
    for (let attempt = 1; attempt < APP_LOCK_MAX_ATTEMPTS; attempt += 1) {
      state = registerUnlockFailure(state, NOW);
      expect(state).toEqual({ failedAttempts: attempt, cooldownUntil: null });
    }
  });

  it('starts the pause on the fifth and resets the counter', () => {
    const state = registerUnlockFailure(
      { failedAttempts: APP_LOCK_MAX_ATTEMPTS - 1, cooldownUntil: null },
      NOW,
    );
    expect(state).toEqual({ failedAttempts: 0, cooldownUntil: NOW + APP_LOCK_COOLDOWN_MS });
  });

  it('shows no remaining time before a pause exists', () => {
    expect(cooldownRemainingMs(null, NOW)).toBe(0);
  });

  it('counts the pause down and stops at zero', () => {
    const until = NOW + APP_LOCK_COOLDOWN_MS;
    expect(cooldownRemainingMs(until, NOW)).toBe(APP_LOCK_COOLDOWN_MS);
    expect(cooldownRemainingMs(until, NOW + 1_000)).toBe(APP_LOCK_COOLDOWN_MS - 1_000);
    expect(cooldownRemainingMs(until, until)).toBe(0);
    expect(cooldownRemainingMs(until, until + 60_000)).toBe(0);
  });

  it('starts a fresh count after the pause expires', () => {
    const cooled = registerUnlockFailure(
      { failedAttempts: APP_LOCK_MAX_ATTEMPTS - 1, cooldownUntil: null },
      NOW,
    );
    expect(cooldownRemainingMs(cooled.cooldownUntil, NOW + APP_LOCK_COOLDOWN_MS + 1)).toBe(0);
    const next = registerUnlockFailure(cooled, NOW + APP_LOCK_COOLDOWN_MS + 1);
    expect(next).toEqual({ failedAttempts: 1, cooldownUntil: cooled.cooldownUntil });
  });
});
