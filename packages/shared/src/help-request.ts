import { z } from 'zod';

import type { StatusPresentation } from './status-presentation';

/**
 * The help-request contract (docs/specs/sprint-8.md, Flow F).
 *
 * The older adult raises a request for their care circle. The vocabulary is fixed here so the
 * family screens, the elder screens and the notification centre all agree with the database
 * check constraints in `20261107120000_sprint8_help_requests.sql`.
 *
 * Every category and state carries a human label and a presentation (label + icon + tone), so a
 * status is never conveyed by colour alone (docs/02-ui-ux-standard.md section 6).
 */

export const helpRequestCategorySchema = z.enum(['urgent', 'practical', 'companionship']);
export type HelpRequestCategory = z.infer<typeof helpRequestCategorySchema>;

export const helpRequestStateSchema = z.enum(['open', 'accepted', 'completed', 'cancelled']);
export type HelpRequestState = z.infer<typeof helpRequestStateSchema>;

export const helpRequestCategoryLabels: Record<HelpRequestCategory, string> = {
  urgent: 'Urgent',
  practical: 'Practical',
  companionship: 'Companionship',
};

export const helpRequestStateLabels: Record<HelpRequestState, string> = {
  open: 'Open',
  accepted: 'Accepted',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const helpRequestCategoryPresentation: Record<HelpRequestCategory, StatusPresentation> = {
  urgent: { label: helpRequestCategoryLabels.urgent, icon: 'alert-triangle', tone: 'danger' },
  practical: { label: helpRequestCategoryLabels.practical, icon: 'help', tone: 'neutral' },
  companionship: { label: helpRequestCategoryLabels.companionship, icon: 'home', tone: 'neutral' },
};

export const helpRequestStatePresentation: Record<HelpRequestState, StatusPresentation> = {
  open: { label: helpRequestStateLabels.open, icon: 'help', tone: 'attention' },
  accepted: { label: helpRequestStateLabels.accepted, icon: 'clock', tone: 'neutral' },
  completed: { label: helpRequestStateLabels.completed, icon: 'check', tone: 'success' },
  cancelled: { label: helpRequestStateLabels.cancelled, icon: 'close', tone: 'neutral' },
};
