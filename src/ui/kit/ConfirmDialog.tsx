import { Heading } from 'react-aria-components'
import { Modal, Dialog } from './Modal'
import { Button, type ButtonKitProps } from './Button'

export interface ConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  text?: React.ReactNode
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: ButtonKitProps['variant']
  onConfirm: () => void
}

/** Controlled confirm/alert dialog. Replaces cladd's Dialog + useDialog.confirm. */
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
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable variant="center">
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
                  onConfirm()
                  close()
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </Modal>
  )
}
