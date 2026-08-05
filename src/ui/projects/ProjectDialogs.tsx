import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, ConfirmDialog, Dialog, DialogHeader, Modal, TextField } from '../kit';
import { TrashIcon } from '../layerIcons';
import {
  $projectName,
  deleteProject,
  listProjects,
  loadProject,
  renameCurrentProject,
  type ProjectSummary,
} from '../../state/projectStore';

/**
 * The root-hosted project overlays (`DialogRoot` ids `'projects'` and `'rename-project'`).
 * Lifted out of the v1 `ProjectButton` popover verbatim so the menubar, the command
 * palette and the phone shell can all open them the same way.
 *
 * Neither dialog enrolls in undo: project load/rename/delete are storage operations, not
 * document mutations.
 */

function formatSavedAt(ms: number): string {
  if (!ms) return 'unsaved';
  return new Date(ms).toLocaleString();
}

/**
 * "Load Project" — every saved project with its SubPart count and save time, plus a
 * per-row delete behind a confirm.
 *
 * The `setTick` re-render below is deliberate v1 behaviour kept as-is: localStorage is
 * not reactive, so the list needs a nudge after a delete. The reactive, id-keyed project
 * index that replaces it is owned by the projects-storage phase — do not "fix" it here.
 */
export function LoadProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentName = useStore($projectName);
  // setTick re-renders to refresh the list after a delete (localStorage isn't reactive).
  const [, setTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const projects: ProjectSummary[] = isOpen ? listProjects() : [];

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant="center"
      className="max-w-lg"
    >
      <Dialog>
        <DialogHeader title="Load Project" onClose={() => onOpenChange(false)} />
        <div className="flex max-h-[60vh] flex-col gap-0.5 overflow-auto p-3">
          {projects.length === 0 ? (
            <div className="p-2 text-sm text-fg-subtle">No saved projects yet.</div>
          ) : (
            projects.map((p) => {
              const isCurrent = p.name === currentName;
              return (
                <div
                  key={p.name}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-fg">
                      {p.name}
                      {isCurrent && <span className="ml-1 text-fg-subtle">(current)</span>}
                    </span>
                    <span className="truncate text-xs text-fg-subtle">
                      {p.subPartCount} SubPart{p.subPartCount === 1 ? '' : 's'} ·{' '}
                      {formatSavedAt(p.savedAt)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    isDisabled={isCurrent}
                    onPress={() => {
                      loadProject(p.name);
                      onOpenChange(false);
                    }}
                  >
                    {isCurrent ? 'Loaded' : 'Load'}
                  </Button>
                  <Button
                    size="sm"
                    iconOnly
                    variant="danger-ghost"
                    aria-label={`Delete ${p.name}`}
                    onPress={() => setPendingDelete(p)}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        isOpen={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete project “${pendingDelete.name}”?` : ''}
        text="This permanently removes the saved project. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDelete) deleteProject(pendingDelete.name);
          setTick((t) => t + 1);
        }}
      />
    </Modal>
  );
}

/**
 * "Rename Project" — a single text field seeded from the current project name. Enter or
 * the Rename button commits and closes.
 *
 * INTERIM: v1 rename semantics verbatim, including the silent same-name overwrite (a
 * rename onto an existing project's name clobbers it). The collision auto-suffix fix
 * belongs to the projects-storage phase, which owns that surface.
 */
export function RenameProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const name = useStore($projectName);
  const [draft, setDraft] = useState(name);
  const commit = () => {
    renameCurrentProject(draft);
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
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
