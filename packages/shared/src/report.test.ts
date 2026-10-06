import { describe, expect, it } from 'vitest';

import {
  adherenceReportSchema,
  defaultReportRangeDays,
  maxReportRangeDays,
  reportRangeBounds,
  reportRangeOptions,
} from './index';

/**
 * Sprint 9 report contract (docs/specs/sprint-9.md).
 *
 * The schema mirrors `get_adherence_report` exactly, and the range helper builds
 * device-local date-only bounds without ever round-tripping a stored local date.
 */

const validReport = {
  from: '2026-06-01',
  to: '2026-06-05',
  days: [
    { date: '2026-06-01', taken: 2, missed: 0, open: 0, settled: 2, expected: 2 },
    { date: '2026-06-02', taken: 0, missed: 1, open: 0, settled: 1, expected: 1 },
  ],
  totals: { taken: 2, missed: 1, open: 0, settled: 3, expected: 3, percent: 67 },
};

describe('adherenceReportSchema', () => {
  it('accepts the RPC payload', () => {
    expect(adherenceReportSchema.safeParse(validReport).success).toBe(true);
  });

  it('rejects a non-integer or out-of-range rate', () => {
    expect(
      adherenceReportSchema.safeParse({
        ...validReport,
        totals: { ...validReport.totals, percent: 66.7 },
      }).success,
    ).toBe(false);
    expect(
      adherenceReportSchema.safeParse({
        ...validReport,
        totals: { ...validReport.totals, percent: 101 },
      }).success,
    ).toBe(false);
  });

  it('rejects a negative count and a malformed date', () => {
    expect(
      adherenceReportSchema.safeParse({
        ...validReport,
        days: [{ ...validReport.days[0], taken: -1 }],
      }).success,
    ).toBe(false);
    expect(adherenceReportSchema.safeParse({ ...validReport, to: '06-05-2026' }).success).toBe(
      false,
    );
  });

  it('offers the fixed ranges only', () => {
    expect(reportRangeOptions).toEqual([7, 30, 90]);
    expect(defaultReportRangeDays).toBe(7);
    expect(maxReportRangeDays).toBe(366);
  });
});

describe('reportRangeBounds', () => {
  it('returns an inclusive range ending today', () => {
    expect(reportRangeBounds(7, new Date(2026, 5, 5))).toEqual({
      from: '2026-05-30',
      to: '2026-06-05',
    });
  });

  it('handles a one-day range and a month/year rollover', () => {
    expect(reportRangeBounds(1, new Date(2026, 5, 5))).toEqual({
      from: '2026-06-05',
      to: '2026-06-05',
    });
    expect(reportRangeBounds(7, new Date(2026, 0, 3))).toEqual({
      from: '2025-12-28',
      to: '2026-01-03',
    });
  });
});
