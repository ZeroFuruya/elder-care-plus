import { z } from 'zod';

/** Stored in `profiles.role`; never trusted from client state. */
export const userRoleSchema = z.enum(['caregiver', 'elder']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userRoleLabels: Record<UserRole, string> = {
  caregiver: 'Family caregiver',
  elder: 'Elder',
};
