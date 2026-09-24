import { describe, expect, it } from 'vitest';

import { DEFAULT_GRACE_MINUTES, deriveDoseStatus } from './dose';

const at = (iso: string) => new Date(iso);
const GRACE = DEFAULT_GRACE_MINUTES;

describe('deriveDoseStatus', () => {
  const scheduled = at('2026-09-24T08:00:00.000Z');

  it('is upcoming before the scheduled time', () => {
    expect(deriveDoseStatus({ scheduledAt: scheduled }, at('2026-09-24T07:59:00.000Z'))).toBe(
      'upcoming',
    );
  });

  it('is due exactly at the scheduled time', () => {
    expect(deriveDoseStatus({ scheduledAt: scheduled }, scheduled)).toBe('due');
  });

  it('is still due inside the grace period', () => {
    expect(deriveDoseStatus({ scheduledAt: scheduled }, at('2026-09-24T08:29:59.000Z'))).toBe(
      'due',
    );
  });

  it('is missed once the grace period elapses', () => {
    expect(deriveDoseStatus({ scheduledAt: scheduled }, at('2026-09-24T08:30:00.000Z'))).toBe(
      'missed',
    );
    expect(deriveDoseStatus({ scheduledAt: scheduled }, at('2026-09-24T23:00:00.000Z'))).toBe(
      'missed',
    );
  });

  it('is taken whenever a confirmation exists, even after the grace period', () => {
    expect(
      deriveDoseStatus(
        { scheduledAt: scheduled, takenAt: at('2026-09-24T09:00:00.000Z') },
        at('2026-09-25T00:00:00.000Z'),
      ),
    ).toBe('taken');
    expect(
      deriveDoseStatus(
        { scheduledAt: scheduled, takenAt: at('2026-09-24T08:05:00.000Z') },
        scheduled,
      ),
    ).toBe('taken');
  });

  it('honours a custom grace period', () => {
    expect(deriveDoseStatus({ scheduledAt: scheduled }, at('2026-09-24T08:10:00.000Z'), 5)).toBe(
      'missed',
    );
    expect(deriveDoseStatus({ scheduledAt: scheduled }, at('2026-09-24T09:00:00.000Z'), 120)).toBe(
      'due',
    );
  });

  it('accepts ISO strings and epoch numbers', () => {
    expect(deriveDoseStatus({ scheduledAt: '2026-09-24T08:00:00.000Z' }, scheduled.getTime())).toBe(
      'due',
    );
    expect(deriveDoseStatus({ scheduledAt: scheduled.getTime() }, '2026-09-24T07:00:00.000Z')).toBe(
      'upcoming',
    );
  });

  it('defaults the grace period to the approved value', () => {
    expect(GRACE).toBe(30);
  });
});
