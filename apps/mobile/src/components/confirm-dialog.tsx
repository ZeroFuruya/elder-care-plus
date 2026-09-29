import { Button } from '@/components/button';
import { ModalCard } from '@/components/modal-card';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** In-app yes/no confirmation. Replaces system alerts (checking requirement). */
export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ModalCard visible={visible} title={title} description={description} onRequestClose={onCancel}>
      <Button
        label={confirmLabel}
        variant={danger ? 'danger' : 'primary'}
        onPress={onConfirm}
        loading={busy}
      />
      <Button label={cancelLabel} variant="secondary" onPress={onCancel} disabled={busy} />
    </ModalCard>
  );
}
