import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Elder Today: today's due doses with a 56 dp `Mark as taken` action, plus the
 * always-visible Emergency shortcut. Offline confirmations show `Pending sync`.
 */
export default function ElderTodayScreen() {
  return (
    <ScreenScaffold
      title="Today"
      description="Today's scheduled doses. `Mark as taken` uses a 56 dp target; offline confirmations visibly queue as Pending sync."
    />
  );
}
