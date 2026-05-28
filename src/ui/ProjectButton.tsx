import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { FolderOpen } from 'lucide-react'
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Modal,
  Dialog,
  DialogHeader,
  ConfirmDialog,
  Button,
  TextField,
  SectionTitle,
  ToolbarButton,
} from './kit'
import { TrashIcon } from './layerIcons'
import {
  $projectName,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  renameCurrentProject,
  uniqueProjectName,
  type ProjectSummary,
} from '../state/projectStore'

/**
 * Top toolbar "Project" action. The trigger shows the current project's name; the
 * popover lets you rename it, start a new project, or open the load-project dialog
 * (a list of every saved project, with load + delete). The workspace autosaves, so
 * there's no explicit save action.
 */
export function ProjectButton() {
  const name = useStore($projectName)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)

  return (
    <>
      <DialogTrigger isOpen={popoverOpen} onOpenChange={setPopoverOpen}>
        <ToolbarButton aria-label="Project">
          <FolderOpen size={16} />
          <span className="max-w-[14ch] truncate">{name}</span>
        </ToolbarButton>
        <Popover placement="bottom start" className="w-64">
          <PopoverDialog className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-2">
              <SectionTitle>Project Name</SectionTitle>
              {/* key remounts the input (re-seeding its draft) when the project changes. */}
              <ProjectNameInput key={name} name={name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                onPress={() => {
                  setPopoverOpen(false)
                  setLoadOpen(true)
                }}
              >
                Load Project...
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  createProject(uniqueProjectName())
                  setPopoverOpen(false)
                }}
              >
                New Project
              </Button>
            </div>
          </PopoverDialog>
        </Popover>
      </DialogTrigger>

      <LoadProjectDialog isOpen={loadOpen} onOpenChange={setLoadOpen} />
    </>
  )
}

/** Renames the current project on blur / Enter. Seeded from `name` (remount to resync). */
function ProjectNameInput({ name }: { name: string }) {
  const [draft, setDraft] = useState(name)
  const commit = () => renameCurrentProject(draft)

  return (
    <TextField
      size="sm"
      aria-label="Project name"
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      placeholder="Project name"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function formatSavedAt(ms: number): string {
  if (!ms) return 'unsaved'
  return new Date(ms).toLocaleString()
}

function LoadProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const currentName = useStore($projectName)
  // setTick re-renders to refresh the list after a delete (localStorage isn't reactive).
  const [, setTick] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)
  const projects: ProjectSummary[] = isOpen ? listProjects() : []

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable variant="center" className="max-w-lg">
      <Dialog>
        <DialogHeader title="Load Project" onClose={() => onOpenChange(false)} />
        <div className="flex max-h-[60vh] flex-col gap-0.5 overflow-auto p-3">
          {projects.length === 0 ? (
            <div className="p-2 text-sm text-fg-subtle">No saved projects yet.</div>
          ) : (
            projects.map((p) => {
              const isCurrent = p.name === currentName
              return (
                <div key={p.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-fg">
                      {p.name}
                      {isCurrent && <span className="ml-1 text-fg-subtle">(current)</span>}
                    </span>
                    <span className="truncate text-xs text-fg-subtle">
                      {p.subPartCount} SubPart{p.subPartCount === 1 ? '' : 's'} · {formatSavedAt(p.savedAt)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    isDisabled={isCurrent}
                    onPress={() => {
                      loadProject(p.name)
                      onOpenChange(false)
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
              )
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
          if (pendingDelete) deleteProject(pendingDelete.name)
          setTick((t) => t + 1)
        }}
      />
    </Modal>
  )
}
