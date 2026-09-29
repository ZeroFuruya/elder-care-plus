import { describe, expect, it } from 'vitest';

import {
  batchInputSchema,
  canonicalizeDaysOfWeek,
  CUSTOM_DOSE_UNIT,
  daysOfWeekSchema,
  doseUnitSchema,
  graceMinutesSchema,
  hasUsableActiveBatch,
  isoDaySchema,
  medicationFormSchema,
  medicationInputSchema,
  resolveDoseUnit,
  scheduleInputSchema,
  stockStatusFromBatch,
  timeOfDaySchema,
  weekdaySchema,
  type BatchLike,
} from './medication';

const VALID_MEDICATION = {
  name: 'Amlodipine',
  strength: '5 mg',
  form: 'tablet' as const,
  doseQuantity: 1,
  doseUnit: 'tablet',
  instructions: 'Take one tablet each morning',
  startDate: '2026-10-01',
  endDate: null,
};

const ACTIVE_BATCH: BatchLike = {
  isActive: true,
  unit: 'tablet',
  expiryDate: '2027-12-31',
};

describe('medicationFormSchema', () => {
  it('accepts the four forms the column allows', () => {
    expect(medicationFormSchema.options).toHaveLength(4);
    for (const value of medicationFormSchema.options) {
      expect(medicationFormSchema.parse(value)).toBe(value);
    }
  });

  it('rejects anything else, including blank and uppercase', () => {
    expect(medicationFormSchema.safeParse('').success).toBe(false);
    expect(medicationFormSchema.safeParse('Tablet').success).toBe(false);
    expect(medicationFormSchema.safeParse('syrup').success).toBe(false);
  });
});

describe('doseUnitSchema', () => {
  it('accepts every listed unit', () => {
    for (const value of doseUnitSchema.options) {
      expect(doseUnitSchema.parse(value)).toBe(value);
    }
  });

  it('rejects a unit outside the list and a blank string', () => {
    expect(doseUnitSchema.safeParse('teaspoon').success).toBe(false);
    expect(doseUnitSchema.safeParse('').success).toBe(false);
    expect(doseUnitSchema.options).toContain(CUSTOM_DOSE_UNIT);
  });
});

describe('resolveDoseUnit', () => {
  it('stores a listed unit as itself', () => {
    expect(resolveDoseUnit('mg')).toBe('mg');
    expect(resolveDoseUnit('tablet')).toBe('tablet');
  });

  it('stores the caregiver’s own words for "other"', () => {
    expect(resolveDoseUnit(CUSTOM_DOSE_UNIT, '  teaspoon  ')).toBe('teaspoon');
  });

  it('returns null when "other" carries nothing, so the form can reject it', () => {
    expect(resolveDoseUnit(CUSTOM_DOSE_UNIT, '')).toBeNull();
    expect(resolveDoseUnit(CUSTOM_DOSE_UNIT, '   ')).toBeNull();
    expect(resolveDoseUnit(CUSTOM_DOSE_UNIT)).toBeNull();
  });
});

describe('isoDaySchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(isoDaySchema.parse('2026-10-01')).toBe('2026-10-01');
  });

  it('rejects unpadded, reordered and empty days', () => {
    expect(isoDaySchema.safeParse('2026-10-1').success).toBe(false);
    expect(isoDaySchema.safeParse('01-10-2026').success).toBe(false);
    expect(isoDaySchema.safeParse('').success).toBe(false);
    expect(isoDaySchema.safeParse('today').success).toBe(false);
  });
});

describe('timeOfDaySchema', () => {
  it('accepts valid 24-hour times', () => {
    for (const value of ['00:00', '08:30', '13:00', '23:59']) {
      expect(timeOfDaySchema.parse(value)).toBe(value);
    }
  });

  it('rejects out-of-range and unpadded times', () => {
    expect(timeOfDaySchema.safeParse('24:00').success).toBe(false);
    expect(timeOfDaySchema.safeParse('08:60').success).toBe(false);
    expect(timeOfDaySchema.safeParse('8:30').success).toBe(false);
    expect(timeOfDaySchema.safeParse('').success).toBe(false);
  });
});

describe('graceMinutesSchema', () => {
  it('accepts the endpoints and the default', () => {
    expect(graceMinutesSchema.parse(5)).toBe(5);
    expect(graceMinutesSchema.parse(30)).toBe(30);
    expect(graceMinutesSchema.parse(120)).toBe(120);
  });

  it('rejects values outside 5-120', () => {
    expect(graceMinutesSchema.safeParse(4).success).toBe(false);
    expect(graceMinutesSchema.safeParse(121).success).toBe(false);
    expect(graceMinutesSchema.safeParse(-30).success).toBe(false);
  });

  it('rejects anything that is not a 5-minute step or an integer', () => {
    expect(graceMinutesSchema.safeParse(31).success).toBe(false);
    expect(graceMinutesSchema.safeParse(30.5).success).toBe(false);
  });
});

describe('weekday schemas', () => {
  it('accepts 0-6 and rejects out-of-range or fractional days', () => {
    expect(weekdaySchema.parse(0)).toBe(0);
    expect(weekdaySchema.parse(6)).toBe(6);
    expect(weekdaySchema.safeParse(7).success).toBe(false);
    expect(weekdaySchema.safeParse(-1).success).toBe(false);
    expect(weekdaySchema.safeParse(1.5).success).toBe(false);
  });

  it('requires at least one day', () => {
    expect(daysOfWeekSchema.parse([1])).toEqual([1]);
    expect(daysOfWeekSchema.safeParse([]).success).toBe(false);
    expect(daysOfWeekSchema.safeParse([0, 1, 2, 3, 4, 5, 6]).success).toBe(true);
  });
});

describe('canonicalizeDaysOfWeek', () => {
  it('sorts and de-duplicates, like the create_schedule RPC', () => {
    expect(canonicalizeDaysOfWeek([5, 1, 3])).toEqual([1, 3, 5]);
    expect(canonicalizeDaysOfWeek([3, 1, 5, 1])).toEqual([1, 3, 5]);
    expect(canonicalizeDaysOfWeek([2, 1, 2])).toEqual([1, 2]);
  });

  it('leaves an already-canonical array alone and does not mutate its input', () => {
    const input = [1, 2, 3];
    expect(canonicalizeDaysOfWeek(input)).toEqual([1, 2, 3]);
    expect(input).toEqual([1, 2, 3]);
  });

  it('handles the empty array without throwing (validation is the schema’s job)', () => {
    expect(canonicalizeDaysOfWeek([])).toEqual([]);
  });
});

describe('medicationInputSchema', () => {
  it('accepts a complete medicine', () => {
    expect(medicationInputSchema.safeParse(VALID_MEDICATION).success).toBe(true);
  });

  it('rejects blank name, strength, dose unit and instructions', () => {
    for (const field of ['name', 'strength', 'doseUnit', 'instructions'] as const) {
      expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, [field]: '' }).success).toBe(
        false,
      );
      expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, [field]: '   ' }).success).toBe(
        false,
      );
    }
  });

  it('rejects a dose quantity that is not positive', () => {
    expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, doseQuantity: 0 }).success).toBe(
      false,
    );
    expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, doseQuantity: -1 }).success).toBe(
      false,
    );
  });

  it('rejects an unknown form but allows an unrecorded one', () => {
    expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, form: 'syrup' }).success).toBe(
      false,
    );
    expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, form: null }).success).toBe(true);
  });

  it('rejects an end date before the start date and allows an equal one', () => {
    expect(
      medicationInputSchema.safeParse({
        ...VALID_MEDICATION,
        endDate: '2026-09-30',
      }).success,
    ).toBe(false);
    expect(
      medicationInputSchema.safeParse({
        ...VALID_MEDICATION,
        endDate: '2026-10-01',
      }).success,
    ).toBe(true);
  });

  it('accepts an ongoing medicine with no end date', () => {
    expect(medicationInputSchema.safeParse({ ...VALID_MEDICATION, endDate: null }).success).toBe(
      true,
    );
  });

  it('rejects a malformed start date', () => {
    expect(
      medicationInputSchema.safeParse({ ...VALID_MEDICATION, startDate: '2026-10-1' }).success,
    ).toBe(false);
  });
});

describe('scheduleInputSchema', () => {
  const VALID_SCHEDULE = {
    daysOfWeek: [1, 3, 5],
    timeOfDay: '08:00',
    timezone: 'Asia/Singapore',
    graceMinutes: 30,
  };

  it('accepts a complete schedule', () => {
    expect(scheduleInputSchema.safeParse(VALID_SCHEDULE).success).toBe(true);
  });

  it('rejects an empty day set, a blank timezone and a bad grace', () => {
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, daysOfWeek: [] }).success).toBe(
      false,
    );
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, daysOfWeek: [7] }).success).toBe(
      false,
    );
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, timezone: '  ' }).success).toBe(
      false,
    );
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, graceMinutes: 4 }).success).toBe(
      false,
    );
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, graceMinutes: 121 }).success).toBe(
      false,
    );
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, timeOfDay: '25:00' }).success).toBe(
      false,
    );
  });

  it('accepts the 5 and 120 endpoints', () => {
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, graceMinutes: 5 }).success).toBe(
      true,
    );
    expect(scheduleInputSchema.safeParse({ ...VALID_SCHEDULE, graceMinutes: 120 }).success).toBe(
      true,
    );
  });
});

describe('batchInputSchema', () => {
  const VALID_BATCH = {
    quantity: 30,
    unit: 'tablet',
    lotNumber: 'LOT-A1',
    expiryDate: '2027-12-31',
    lowStockThreshold: 7,
    refillContact: 'Night Pharmacy',
  };

  it('accepts a complete batch', () => {
    expect(batchInputSchema.safeParse(VALID_BATCH).success).toBe(true);
  });

  it('accepts a batch with every optional field absent as null', () => {
    expect(
      batchInputSchema.safeParse({
        ...VALID_BATCH,
        lotNumber: null,
        lowStockThreshold: null,
        refillContact: null,
      }).success,
    ).toBe(true);
  });

  it('rejects a cleared optional field written as an empty string', () => {
    expect(batchInputSchema.safeParse({ ...VALID_BATCH, lotNumber: '' }).success).toBe(false);
    expect(batchInputSchema.safeParse({ ...VALID_BATCH, refillContact: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects a negative quantity or threshold and a blank unit', () => {
    expect(batchInputSchema.safeParse({ ...VALID_BATCH, quantity: -1 }).success).toBe(false);
    expect(batchInputSchema.safeParse({ ...VALID_BATCH, unit: '' }).success).toBe(false);
    expect(batchInputSchema.safeParse({ ...VALID_BATCH, lowStockThreshold: -1 }).success).toBe(
      false,
    );
  });

  it('accepts a zero quantity (an empty pack is a real state)', () => {
    expect(batchInputSchema.safeParse({ ...VALID_BATCH, quantity: 0 }).success).toBe(true);
  });
});

describe('hasUsableActiveBatch', () => {
  const TODAY = '2026-10-08';

  it('is true for an active, unexpired batch whose unit matches', () => {
    expect(hasUsableActiveBatch(ACTIVE_BATCH, 'tablet', TODAY)).toBe(true);
  });

  it('is false for a missing or inactive batch', () => {
    expect(hasUsableActiveBatch(null, 'tablet', TODAY)).toBe(false);
    expect(hasUsableActiveBatch(undefined, 'tablet', TODAY)).toBe(false);
    expect(hasUsableActiveBatch({ ...ACTIVE_BATCH, isActive: false }, 'tablet', TODAY)).toBe(false);
  });

  it('is false for an expired batch, and true on its expiry day', () => {
    expect(
      hasUsableActiveBatch({ ...ACTIVE_BATCH, expiryDate: '2026-10-07' }, 'tablet', TODAY),
    ).toBe(false);
    expect(hasUsableActiveBatch({ ...ACTIVE_BATCH, expiryDate: TODAY }, 'tablet', TODAY)).toBe(
      true,
    );
  });

  it('is false on a unit mismatch, exactly as the database compares them', () => {
    expect(hasUsableActiveBatch(ACTIVE_BATCH, 'mg', TODAY)).toBe(false);
    expect(hasUsableActiveBatch({ ...ACTIVE_BATCH, unit: 'Tablet' }, 'tablet', TODAY)).toBe(false);
    expect(hasUsableActiveBatch({ ...ACTIVE_BATCH, unit: 'tab' }, 'tablet', TODAY)).toBe(false);
  });
});

describe('stockStatusFromBatch', () => {
  const TODAY = '2026-10-08';

  it('reports normal stock above the threshold', () => {
    expect(stockStatusFromBatch(30, 7, '2027-12-31', true, TODAY)).toBe('normal');
  });

  it('reports low stock at and below the threshold', () => {
    expect(stockStatusFromBatch(7, 7, '2027-12-31', true, TODAY)).toBe('low');
    expect(stockStatusFromBatch(6, 7, '2027-12-31', true, TODAY)).toBe('low');
  });

  it('reports out of stock at zero', () => {
    expect(stockStatusFromBatch(0, 7, '2027-12-31', true, TODAY)).toBe('out');
  });

  it('treats a missing threshold as no low-stock rule', () => {
    expect(stockStatusFromBatch(1, null, '2027-12-31', true, TODAY)).toBe('normal');
    expect(stockStatusFromBatch(1, undefined, '2027-12-31', true, TODAY)).toBe('normal');
  });

  it('reports needs_review when no valid active batch remains', () => {
    expect(stockStatusFromBatch(0, 7, null, false, TODAY)).toBe('needs_review');
  });

  it('reports an expired batch as expired even if a stale flag claims it is valid', () => {
    expect(stockStatusFromBatch(30, 7, '2026-10-07', true, TODAY)).toBe('expired');
  });

  it('does not report expiring: that window is Sprint 5’s', () => {
    expect(stockStatusFromBatch(30, 7, '2026-11-01', true, TODAY)).toBe('normal');
  });
});
