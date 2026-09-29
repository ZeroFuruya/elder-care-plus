import { describe, expect, it } from 'vitest';

import {
  bloodTypeLabels,
  bloodTypeSchema,
  countPhoneDigits,
  dialNumber,
  emergencyCategoryLabels,
  emergencyCategorySchema,
  emergencyNumberInputSchema,
  MIN_PHONE_DIGITS,
  phoneLooksValid,
} from './emergency';

describe('bloodTypeSchema', () => {
  it('accepts every value the database stores', () => {
    for (const value of bloodTypeSchema.options) {
      expect(bloodTypeSchema.parse(value)).toBe(value);
    }
  });

  it('rejects values the database would reject', () => {
    expect(bloodTypeSchema.safeParse('a+').success).toBe(false);
    expect(bloodTypeSchema.safeParse('AA+').success).toBe(false);
    expect(bloodTypeSchema.safeParse('').success).toBe(false);
  });

  it('expands every label instead of repeating an abbreviation', () => {
    for (const value of bloodTypeSchema.options) {
      expect(bloodTypeLabels[value]).toBeTruthy();
    }
    expect(bloodTypeLabels.unknown).toBe('Not recorded');
    expect(bloodTypeLabels['O-']).toBe('O negative');
  });
});

describe('emergencyCategorySchema', () => {
  it('accepts the five categories and nothing else', () => {
    expect(emergencyCategorySchema.options).toHaveLength(5);
    expect(emergencyCategorySchema.parse('emergency_service')).toBe('emergency_service');
    expect(emergencyCategorySchema.safeParse('police').success).toBe(false);
    expect(emergencyCategorySchema.safeParse('').success).toBe(false);
  });

  it('has a label for every category', () => {
    for (const category of emergencyCategorySchema.options) {
      expect(emergencyCategoryLabels[category]).toBeTruthy();
    }
  });
});

describe('phoneLooksValid', () => {
  it('accepts short local emergency numbers', () => {
    expect(phoneLooksValid('995')).toBe(true);
    expect(phoneLooksValid('999')).toBe(true);
    expect(phoneLooksValid('112')).toBe(true);
  });

  it('accepts the formats a caregiver is likely to type', () => {
    expect(phoneLooksValid('+65 8123 4567')).toBe(true);
    expect(phoneLooksValid('(02) 1234-5678')).toBe(true);
    expect(phoneLooksValid('6123 4567')).toBe(true);
    expect(phoneLooksValid('+1 (555) 010-0199')).toBe(true);
  });

  it('rejects blank, lettered and too-short input', () => {
    expect(phoneLooksValid('')).toBe(false);
    expect(phoneLooksValid('   ')).toBe(false);
    expect(phoneLooksValid('+')).toBe(false);
    expect(phoneLooksValid('12')).toBe(false);
    expect(phoneLooksValid('call 995')).toBe(false);
    expect(phoneLooksValid('995ext')).toBe(false);
  });

  it('enforces the same three-digit floor as the database', () => {
    expect(MIN_PHONE_DIGITS).toBe(3);
    expect(countPhoneDigits('(02) 1234-5678')).toBe(10);
  });
});

describe('dialNumber', () => {
  it('keeps a short local number as typed', () => {
    expect(dialNumber('995')).toBe('995');
  });

  it('keeps one leading plus and strips every other separator', () => {
    expect(dialNumber('+65 8123 4567')).toBe('+6581234567');
    expect(dialNumber('  +65 8123 4567  ')).toBe('+6581234567');
    expect(dialNumber('(02) 1234-5678')).toBe('0212345678');
    expect(dialNumber('6123-4567')).toBe('61234567');
    expect(dialNumber('+ 65')).toBe('+65');
  });
});

describe('emergencyNumberInputSchema', () => {
  const valid = {
    category: 'emergency_service' as const,
    label: 'Ambulance',
    phone: '995',
    priority: 0,
  };

  it('accepts a valid input and defaults isPrimary to false', () => {
    const parsed = emergencyNumberInputSchema.parse(valid);
    expect(parsed.isPrimary).toBe(false);
    expect(parsed.label).toBe('Ambulance');
  });

  it('trims the label', () => {
    expect(emergencyNumberInputSchema.parse({ ...valid, label: '  Ambulance  ' }).label).toBe(
      'Ambulance',
    );
  });

  it('rejects a blank label', () => {
    expect(emergencyNumberInputSchema.safeParse({ ...valid, label: '   ' }).success).toBe(false);
  });

  it('rejects a phone the database would refuse', () => {
    expect(emergencyNumberInputSchema.safeParse({ ...valid, phone: '' }).success).toBe(false);
    expect(emergencyNumberInputSchema.safeParse({ ...valid, phone: '12' }).success).toBe(false);
  });

  it('rejects a negative or fractional priority', () => {
    expect(emergencyNumberInputSchema.safeParse({ ...valid, priority: -1 }).success).toBe(false);
    expect(emergencyNumberInputSchema.safeParse({ ...valid, priority: 1.5 }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(emergencyNumberInputSchema.safeParse({ ...valid, category: 'police' }).success).toBe(
      false,
    );
  });
});
