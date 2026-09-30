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

  it('is missed as soon as the server has settled the miss, even inside the client grace window', () => {
    // A device clock that lags, or a late cron run, must not re-open a settled miss.
    expect(
      deriveDoseStatus(
        { scheduledAt: scheduled, missedAt: at('2026-09-24T08:30:00.000Z') },
        at('2026-09-24T08:05:00.000Z'),
      ),
    ).toBe('missed');
  });

  it('is missed from the persisted timestamp long after the grace period', () => {
    expect(
      deriveDoseStatus(
        { scheduledAt: scheduled, missedAt: at('2026-09-24T08:30:00.000Z') },
        at('2026-09-26T00:00:00.000Z'),
      ),
    ).toBe('missed');
  });

  it('treats a null missedAt as "not missed"', () => {
    expect(
      deriveDoseStatus({ scheduledAt: scheduled, missedAt: null }, at('2026-09-24T08:10:00.000Z')),
    ).toBe('due');
  });

  it('lets taken win if both timestamps are somehow set (the DB forbids it)', () => {
    expect(
      deriveDoseStatus(
        {
          scheduledAt: scheduled,
          takenAt: at('2026-09-24T08:05:00.000Z'),
          missedAt: at('2026-09-24T08:30:00.000Z'),
        },
        at('2026-09-27T00:00:00.000Z'),
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
