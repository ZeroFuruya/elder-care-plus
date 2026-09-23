import { ScreenScaffold } from '@/components/screen-scaffold';

/** Elder appointments: view details and reminders. No editing from this role. */
export default function ElderAppointmentsScreen() {
  return (
    <ScreenScaffold
      title="Appointments"
      description="Upcoming and past appointments with reminders. Call provider / Open map where available."
    />
  );
}
