import type { ReportRange } from '@eldercare/shared';

import { ChoiceChips } from '@/components/choice-chips';

/**
 * The Sprint 9 report period selector (docs/specs/sprint-9.md OD1): the fixed
 * 7 / 30 / 90-day ranges, shared by `C-09`, `C-12`, `E-08` and the family Home so
 * every report surface offers the same choice. `ChoiceChips` takes string values,
 * so the machine value is the day count as a string.
 */
const OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

type RangeValue = (typeof OPTIONS)[number]['value'];

interface ReportRangeChipsProps {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
}

export function ReportRangeChips({ value, onChange }: ReportRangeChipsProps) {
  return (
    <ChoiceChips
      label="Period"
      options={[...OPTIONS]}
      value={String(value) as RangeValue}
      onChange={(next) => onChange(Number(next) as ReportRange)}
    />
  );
}
