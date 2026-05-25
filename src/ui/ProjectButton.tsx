import { useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Button,
  Dialog,
  Input,
  List,
  ListItem,
  Popover,
  PopoverRoot,
  PopoverTrigger,
  SectionTitle,
  ToolbarButton,
  useDialog,
} from '@cladd-ui/react'
import { FolderOpen } from 'lucide-react'
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
import { TrashIcon } from './layerIcons'

/**
 * Top toolbar "Project" action. The trigger shows the current project's name; the
 * popover lets you rename it, start a new project, or open the load-project dialog
 * (a list of every saved project, with load + delete). The workspace autosaves, so
 * there's no explicit save action. See src/state/projectStore.ts.
 */
export function ProjectButton() {
  const name = useStore($projectName)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)

  return (
    <>
      <PopoverRoot open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger>
          <ToolbarButton aria-label="Project">
            <span className="flex items-center gap-1.5">
              <FolderOpen size={16} />
              <span className="max-w-[14ch] truncate">{name}</span>
            </span>
          </ToolbarButton>
        </PopoverTrigger>
        <Popover position="bottom-start" className="w-64 rounded-lg" contentClassName="p-3">
          <SectionTitle>Project Name</SectionTitle>
          {/* key={name} remounts the input (re-seeding its draft) when the
              underlying project changes via load / new. */}
          <ProjectNameInput key={name} name={name} className="mt-2" />

          <div className="mt-3 flex flex-col gap-1.5">
            <Button size="sm" onClick={() => { setPopoverOpen(false); setLoadOpen(true) }}>
              Load Project...
            </Button>
            <Button
              size="sm"
              variant="transparent"
              onClick={() => { createProject(uniqueProjectName()); setPopoverOpen(false) }}
            >
              New Project
            </Button>
          </div>
        </Popover>
      </PopoverRoot>

      <LoadProjectDialog open={loadOpen} onClose={() => setLoadOpen(false)} />
    </>
  )
}

/** Renames the current project on blur / Enter. Seeded from `name` (remount to resync). */
function ProjectNameInput({ name, className }: { name: string; className?: string }) {
  const [draft, setDraft] = useState(name)

  const commit = () => renameCurrentProject(draft)

  return (
    <Input
      size="sm"
      className={className}
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

function LoadProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const currentName = useStore($projectName)
  // setTick re-renders to refresh the list after a delete (localStorage isn't reactive);
  // the list is read on every render, which is cheap for a dialog.
  const [, setTick] = useState(0)
  const projects: ProjectSummary[] = open ? listProjects() : []
  const dialog = useDialog()

  const confirmDelete = (p: ProjectSummary) =>
    dialog.confirm({
      title: `Delete project “${p.name}”?`,
      text: 'This permanently removes the saved project. This cannot be undone.',
      confirmButtonText: 'Delete',
      confirmButtonColor: 'red',
      onConfirm: () => {
        deleteProject(p.name)
        setTick((t) => t + 1)
      },
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      title="Load Project"
      cancelButtonText="Close"
    >
      {projects.length === 0 ? (
        <div className="text-cladd-sm text-cladd-fg-softer">No saved projects yet.</div>
      ) : (
        <List className="max-h-[50vh] gap-0.5 overflow-auto p-0">
          {projects.map((p) => {
            const isCurrent = p.name === currentName
            return (
              <ListItem key={p.name} className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-cladd-sm text-cladd-fg">
                    {p.name}
                    {isCurrent && <span className="ml-1 text-cladd-fg-softer">(current)</span>}
                  </span>
                  <span className="truncate text-cladd-xs text-cladd-fg-softer">
                    {p.subPartCount} SubPart{p.subPartCount === 1 ? '' : 's'} · {formatSavedAt(p.savedAt)}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={isCurrent}
                  onClick={() => { loadProject(p.name); onClose() }}
                >
                  {isCurrent ? 'Loaded' : 'Load'}
                </Button>
                <Button
                  square
                  size="sm"
                  variant="transparent"
                  color="red"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => confirmDelete(p)}
                >
                  <TrashIcon />
                </Button>
              </ListItem>
            )
          })}
        </List>
      )}
    </Dialog>
  )
}
