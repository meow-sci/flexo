import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { $buildMismatch } from '../buildCheck';
import { nukeAndReload } from './nukeAndReload';
import { Button, ConfirmDialog, Dialog, Modal, Switch } from './kit';
import { Heading } from 'react-aria-components';

export function BuildIdMismatchDialog() {
  const mismatch = useStore($buildMismatch);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetFsGrants, setResetFsGrants] = useState(false);

  if (!mismatch) return null;

  function dismiss() {
    $buildMismatch.set(false);
  }

  return (
    <>
      <Modal isOpen isDismissable={false} variant="center">
        <Dialog className="gap-4 p-5" role="alertdialog">
          <Heading slot="title" className="text-base font-semibold text-fg">
            New version available
          </Heading>
          <p className="text-sm text-fg-muted">
            A new build of Flexo was deployed since you last visited. Your saved data may be
            incompatible — resetting clears all local data and reloads the page.
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="secondary" onPress={dismiss}>
              No thanks, I know what I&apos;m doing
            </Button>
            <Button
              variant="danger"
              onPress={() => {
                setResetFsGrants(false);
                setConfirmOpen(true);
              }}
            >
              Reset everything
            </Button>
          </div>
        </Dialog>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset all data?"
        text="This will permanently delete all projects, containers, measurements, and settings stored in this browser. This cannot be undone."
        confirmLabel="Reset and reload"
        confirmVariant="danger"
        onConfirm={() => void nukeAndReload({ resetFsGrants })}
      >
        <Switch isSelected={resetFsGrants} onChange={setResetFsGrants}>
          Reset folder access grants (if any)
        </Switch>
      </ConfirmDialog>
    </>
  );
}
