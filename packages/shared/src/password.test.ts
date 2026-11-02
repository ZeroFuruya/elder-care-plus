import { describe, expect, it } from 'vitest';

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS,
  passwordMeetsPolicy,
  passwordProblem,
} from './password';

describe('passwordProblem', () => {
  it('rejects an empty password', () => {
    expect(passwordProblem('')).toBe('Enter your password.');
  });

  it('rejects anything shorter than the minimum, whatever the mix', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(passwordProblem('Abcdefg1')).toBe('Use at least 10 characters.');
  });

  it('names the missing character class', () => {
    expect(passwordProblem('abcdefghij1')).toBe('Add an upper-case letter.');
    expect(passwordProblem('ABCDEFGHIJ1')).toBe('Add a lower-case letter.');
    expect(passwordProblem('Abcdefghij')).toBe('Add a number.');
  });

  it('accepts a password that satisfies the server rule', () => {
    expect(passwordProblem('ElderCare1')).toBeNull();
    expect(passwordMeetsPolicy('ElderCare1')).toBe(true);
  });

  it('counts an exactly-minimum password as acceptable', () => {
    expect(passwordProblem('Abcdefgh12')).toBeNull();
  });

  it('does not trim: spaces are characters the user typed', () => {
    expect(passwordProblem('Abcdefg1  ')).toBeNull();
    expect(passwordProblem('Abcdef1   ')).toBeNull();
  });

  it('ships copy the sign-up screen can show verbatim', () => {
    expect(PASSWORD_REQUIREMENTS).toMatch(/10 characters/);
  });
});
