import { describe, expect, it } from 'vitest';

import { userRoleLabels, userRoleSchema } from './role';

describe('userRoleSchema', () => {
  it('accepts the three product roles', () => {
    expect(userRoleSchema.parse('caregiver')).toBe('caregiver');
    expect(userRoleSchema.parse('elder')).toBe('elder');
    expect(userRoleSchema.parse('family_member')).toBe('family_member');
  });

  it('rejects roles the product does not have', () => {
    expect(userRoleSchema.safeParse('admin').success).toBe(false);
    expect(userRoleSchema.safeParse('').success).toBe(false);
  });

  it('has a label for every role', () => {
    for (const role of userRoleSchema.options) {
      expect(userRoleLabels[role]).toBeTruthy();
    }
  });
});
