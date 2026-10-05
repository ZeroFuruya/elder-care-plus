import { useState } from 'react';

import type { StockAdjustmentReason } from '@/db';

import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
import { Field } from '@/components/field';
import { ModalCard } from '@/components/modal-card';

const DIRECTIONS = [
  { value: 'add', label: 'Add stock' },
  { value: 'remove', label: 'Remove stock' },
] as const;
type Direction = (typeof DIRECTIONS)[number]['value'];

/**
 * Display wording for the owner-approved adjustment reasons
 * (`docs/specs/sprint-5.md`). The stored value stays the machine code.
 */
const REASONS: readonly { value: StockAdjustmentReason; label: string }[] = [
  { value: 'restock', label: 'Restock' },
  { value: 'correction', label: 'Correction' },
  { value: 'damage', label: 'Damaged' },
  { value: 'waste', label: 'Wasted' },
  { value: 'count_adjustment', label: 'Count check' },
];

interface AdjustStockDialogProps {
  medicationName: string;
  unit: string;
  currentQuantity: number;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (delta: number, reason: StockAdjustmentReason, note: string) => void;
}

/**
 * `C-04`'s manual stock adjustment, as an in-app dialog (no system alert). A
 * reason is required, the note is optional, and a result below zero is refused
 * here as well as in the database. No new frame: this is the confirmation dialog
 * the spec allows (docs/specs/sprint-5.md D2).
 *
 * Mount it only while open, so each open starts from a clean form.
 */
export function AdjustStockDialog({
  medicationName,
  unit,
  currentQuantity,
  busy = false,
  onCancel,
  onSubmit,
}: AdjustStockDialogProps) {
  const [direction, setDirection] = useState<Direction>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<StockAdjustmentReason>('restock');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    const delta = direction === 'add' ? parsed : -parsed;
    if (currentQuantity + delta < 0) {
      setError(`That is more than the ${currentQuantity} ${unit} in stock.`);
      return;
    }

    setError(null);
    onSubmit(delta, reason, note.trim());
  }

  return (
    <ModalCard
      visible
      title="Adjust stock"
      description={`${medicationName} - currently ${currentQuantity} ${unit}. This change is recorded.`}
      onRequestClose={onCancel}
    >
      <ChoiceChips
        label="Change"
        options={[...DIRECTIONS]}
        value={direction}
        onChange={setDirection}
      />
      <Field
        label={`Amount (${unit})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        error={error ?? undefined}
      />
      <ChoiceChips label="Reason" options={[...REASONS]} value={reason} onChange={setReason} />
      <Field
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />
      <Button label="Save adjustment" onPress={submit} loading={busy} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} />
    </ModalCard>
  );
}
