import type { UserRole } from '@eldercare/shared';

/**
 * One home route per role. The entry gate and every group layout use this map,
 * so a stale navigation state cannot open the wrong shell.
 */
export const HOME_ROUTE = {
  caregiver: '/caregiver',
  elder: '/elder',
  family_member: '/family',
} as const satisfies Record<UserRole, string>;

export type HomeRoute = (typeof HOME_ROUTE)[UserRole];

export function homeRouteFor(role: UserRole): HomeRoute {
  return HOME_ROUTE[role];
}
