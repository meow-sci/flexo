import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { FolderOpen } from 'lucide-react';
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Button,
  TextField,
  SectionTitle,
  ToolbarButton,
} from './kit';
import { openDialog } from '../state/dialogStore';
import {
  $projectName,
  createProject,
  renameCurrentProject,
  uniqueProjectName,
} from '../state/projectStore';

/**
 * INTERIM v1 toolbar "Project" action. Every overlay it used to own is now root-hosted
 * behind a `dialogStore` id (`'projects'`, `'share-link'`, `'export-project'`,
 * `'import-project'`), so this file is only the trigger surface — the menubar's File menu
 * and the project chip replace it and this whole file is deleted with the old toolbar.
 */
export function ProjectButton() {
  const name = useStore($projectName);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const pick = (open: () => void) => {
    setPopoverOpen(false);
    open();
  };

  return (
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
            <Button size="sm" onPress={() => pick(() => openDialog({ id: 'projects' }))}>
              Load Project...
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => pick(() => createProject(uniqueProjectName()))}
            >
              New Project
            </Button>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <SectionTitle>Project Data</SectionTitle>
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => pick(() => openDialog({ id: 'share-link' }))}
              >
                Share Project...
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => pick(() => openDialog({ id: 'export-project' }))}
              >
                Export...
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => pick(() => openDialog({ id: 'import-project' }))}
              >
                Import...
              </Button>
            </div>
          </div>
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}

/** Renames the current project on blur / Enter. Seeded from `name` (remount to resync). */
function ProjectNameInput({ name }: { name: string }) {
  const [draft, setDraft] = useState(name);
  const commit = () => renameCurrentProject(draft);

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
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
