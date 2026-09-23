import { ScreenScaffold } from '@/components/screen-scaffold';

/** Appointments: `visit` and `in_home`, reminders, completion/cancellation (Flow F). */
export default function CaregiverAppointmentsScreen() {
  return (
    <ScreenScaffold
      title="Appointments"
      description="Create, edit, complete and cancel visit or in-home appointments."
    />
  );
}
