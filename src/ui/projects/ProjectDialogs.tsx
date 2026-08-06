import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, ConfirmDialog, Dialog, DialogHeader, Modal, TextField } from '../kit';
import { TrashIcon } from '../layerIcons';
import { deleteProject, openProject } from '../../state/projectStore';
import {
  $currentProjectId,
  $projectIndex,
  $projectName,
  renameProject,
} from '../../state/projectIndexStore';
import type { ProjectMeta } from '../../state/projectDb';

/**
 * The root-hosted project overlays (`DialogRoot` ids `'projects'` and `'rename-project'`).
 *
 * INTERIM: still the v1 list shape, now reading the reactive id-keyed index instead of
 * re-parsing localStorage (the `setTick` hack is gone with it — `$projectIndex` refreshes on
 * every mutation, in this tab and in any other). The rich Project Manager overlay (cards,
 * search, sort, thumbnails, descriptions, duplicate, archive/share row actions) replaces this
 * file in the same phase.
 *
 * Neither dialog enrolls in undo: project load/rename/delete are storage operations, not
 * document mutations.
 */

function formatSavedAt(ms: number): string {
  if (!ms) return 'unsaved';
  return new Date(ms).toLocaleString();
}

/** "Load Project" — every saved project with counts and save time, plus a delete confirm. */
export function LoadProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentId = useStore($currentProjectId);
  const projects = useStore($projectIndex);
  const [pendingDelete, setPendingDelete] = useState<ProjectMeta | null>(null);

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
              const isCurrent = p.id === currentId;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-fg">
                      {p.name}
                      {isCurrent && <span className="ml-1 text-fg-subtle">(current)</span>}
                    </span>
                    <span className="truncate text-xs text-fg-subtle">
                      {p.counts.subParts} SubPart{p.counts.subParts === 1 ? '' : 's'} ·{' '}
                      {formatSavedAt(p.savedAt)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    isDisabled={isCurrent}
                    onPress={() => {
                      void openProject(p.id);
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
        text="This permanently removes the saved project and its stored textures and meshes. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDelete) void deleteProject(pendingDelete.id);
        }}
      />
    </Modal>
  );
}

/**
 * "Rename Project" — a single text field seeded from the current project name. Enter or
 * the Rename button commits and closes.
 *
 * A colliding name no longer clobbers the other project: `renameProject` auto-suffixes
 * ("Rover" → "Rover 2") because storage keys on the project id, never on the name (D1).
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
    if (draft.trim()) void renameProject(currentId, draft);
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
