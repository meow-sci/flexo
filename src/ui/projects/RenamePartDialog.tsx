import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, Dialog, DialogHeader, Modal, TextField } from '../kit';
import { $activePartMeta, renamePart } from '../../state/partsStore';
import { status } from '../../state/statusStore';

/**
 * **Rename Part…** (dialog id `'part-rename'`, size S — plan: `plans/MULTI_PART_PLAN.md`
 * P4.02). Structurally the twin of `RenameProjectDialog`: one field seeded with the current
 * name, Enter or the Rename button commits, Escape or Cancel closes.
 *
 * It always targets the ACTIVE part — the same part the whole editing surface is showing — so
 * it reads `$activePartMeta` rather than taking a params payload that could go stale between
 * the menu opening and the command running. The in-popover row rename (P4.04) is the other
 * entry point to the same `renamePart`.
 *
 * A colliding name cannot clobber another part: `renamePart` auto-suffixes ("Booster" →
 * "Booster 2") because the registry keys on the entry id, never on the name (D6). The suffix is
 * reported in a status flash rather than blocking the rename.
 *
 * **Undo enrollment: NONE** — a part's display name is registry meta, not document state (I6).
 */
export function RenamePartDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = useStore($activePartMeta);
  const name = meta?.name ?? '';
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const value = draft.trim();
    if (meta && value && value !== name) {
      const applied = renamePart(meta.id, value);
      if (applied !== value) status(`Renamed to “${applied}” (name taken)`);
    }
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable variant="center">
      <Dialog>
        <DialogHeader title="Rename Part" onClose={() => onOpenChange(false)} />
        <div className="flex flex-col gap-3 p-4">
          <TextField
            size="sm"
            autoFocus
            aria-label="Part name"
            value={draft}
            onChange={setDraft}
            placeholder="Part name"
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
