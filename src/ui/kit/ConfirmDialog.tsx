import { useRef } from 'react';
import { Heading } from 'react-aria-components';
import { Modal, Dialog } from './Modal';
import { Button, type ButtonKitProps } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonKitProps['variant'];
  onConfirm: () => void;
  /**
   * Runs when the question is declined — the Cancel button, Escape, or a click outside —
   * and never after {@link onConfirm}. Needed when declining is itself an action rather
   * than a no-op (the chain's leave-Build prompt puts the mode back).
   */
  onCancel?: () => void;
}

/** Controlled confirm/alert dialog: title + message + cancel/confirm actions. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  text,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Confirming closes the dialog too, which is the same `onOpenChange(false)` a dismissal
  // produces. The flag (written only from the confirm handler, never during render) is what
  // tells the two apart.
  const confirmed = useRef(false);

  const handleOpenChange = (open: boolean) => {
    if (!open && !confirmed.current) onCancel?.();
    confirmed.current = false;
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} isDismissable variant="center">
      <Dialog className="gap-4 p-4" role="alertdialog">
        {({ close }) => (
          <>
            <Heading slot="title" className="text-base font-semibold text-fg">
              {title}
            </Heading>
            {text != null && <div className="text-sm text-fg-muted">{text}</div>}
            {children}
            <div className="mt-1 flex justify-end gap-2">
              <Button variant="secondary" onPress={close}>
                {cancelLabel}
              </Button>
              <Button
                variant={confirmVariant}
                onPress={() => {
                  confirmed.current = true;
                  onConfirm();
                  close();
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </Modal>
  );
}
