import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, Dialog, DialogHeader, Modal, TextField } from '../kit';
import { $currentProjectId, $projectName, renameProject } from '../../state/projectIndexStore';
import { status } from '../../state/statusStore';

/**
 * **Rename Project…** (dialog id `'rename-project'`, size S — design:
 * `plans/flexo_v2/design/design-projects-export.md` §3).
 *
 * One field, seeded with the current name; Enter or the Rename button commits, Escape or
 * Cancel closes. It exists for menu + palette parity — the Project Manager's inline rename on
 * the current card is the primary path.
 *
 * A colliding name can no longer clobber the other project: `renameProject` auto-suffixes
 * ("Rover" → "Rover 2") because storage keys on the project ID, never on the name (D1). The
 * suffix is reported in a status flash rather than blocking the rename.
 *
 * **Undo enrollment: NONE** — a project's name is metadata, not document state.
 */
export function RenameProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const name = useStore($projectName);
  const currentId = useStore($currentProjectId);
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const value = draft.trim();
    if (value && value !== name) {
      void renameProject(currentId, value).then((applied) => {
        if (applied && applied !== value) status(`Renamed to “${applied}” (name taken)`);
      });
    }
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable variant="center">
      <Dialog>
        <DialogHeader title="Rename Project" onClose={() => onOpenChange(false)} />
        <div className="flex flex-col gap-3 p-4">
          <TextField
            size="sm"
            autoFocus
            aria-label="Project name"
            value={draft}
            onChange={setDraft}
            placeholder="Project name"
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onPress={commit}>
              Rename
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}
