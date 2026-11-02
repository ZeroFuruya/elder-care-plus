import { describe, expect, it } from 'vitest';

import {
  APP_LOCK_COOLDOWN_MS,
  APP_LOCK_MAX_ATTEMPTS,
  APP_LOCK_TIMEOUT_MS,
  parseAppLockRecord,
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
