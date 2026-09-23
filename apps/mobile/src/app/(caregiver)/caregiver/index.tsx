import { ScreenScaffold } from '@/components/screen-scaffold';

/**
 * Caregiver Dashboard: adherence overview, needs-attention alerts, link to
 * Reports, and a prominent Emergency action (docs/00-product-flow.md section 3).
 */
export default function CaregiverDashboardScreen() {
  return (
    <ScreenScaffold
      title="Dashboard"
      description="Adherence summary, stock/expiry alerts needing review, Reports link and Emergency shortcut."
    />
  );
}
