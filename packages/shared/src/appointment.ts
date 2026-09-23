import { z } from 'zod';

export const appointmentTypeSchema = z.enum(['visit', 'in_home']);
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  visit: 'Clinic visit',
  in_home: 'In-home visit',
};

/** Past `upcoming` items display as `overdue` until resolved. */
export const appointmentStateSchema = z.enum(['upcoming', 'completed', 'cancelled', 'overdue']);
export type AppointmentState = z.infer<typeof appointmentStateSchema>;

export const appointmentStateLabels: Record<AppointmentState, string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
  overdue: 'Overdue',
};
