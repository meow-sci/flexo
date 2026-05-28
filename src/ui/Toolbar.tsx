import { useStore } from '@nanostores/react'
import { Undo, Redo } from 'lucide-react'
import { Toolbar, ToolbarButton, ToolbarSeparator, toast } from './kit'
import { $canRedo, $canUndo, redo, undo } from '../state/editorStore'
import { AddButton } from './AddButton'
import { ProjectButton } from './ProjectButton'
import { PartDataButton } from './PartDataButton'
import { ExportButton } from './ExportButton'
import { ViewButton } from './ViewButton'
import { SettingsButton } from './SettingsButton'
import { HistoryButton } from './HistoryButton'

/**
 * Top toolbar: part actions (add/import/part-data/export), the View popover
 * (camera snap + reference grids), and undo/redo. Transform-tool mode now lives
 * in the floating per-SubPart toolbar that appears when a SubPart is selected.
 */
export function EditorToolbar() {
  const canUndo = useStore($canUndo)
  const canRedo = useStore($canRedo)

  return (
    <Toolbar aria-label="Editor actions" className="flex-wrap lg:flex-nowrap">
      <ProjectButton />

      <ToolbarSeparator />

      <AddButton />
      <PartDataButton />
      <ExportButton />

      <ToolbarSeparator />

      <ViewButton />

      <ToolbarSeparator />

      <ToolbarButton
        isDisabled={!canUndo}
        aria-label="Undo"
        onPress={() => {
          const d = undo()
          if (d) toast({ title: `Undo: ${d}` }, { timeout: 1500 })
        }}
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        isDisabled={!canRedo}
        aria-label="Redo"
        onPress={() => {
          const d = redo()
          if (d) toast({ title: `Redo: ${d}` }, { timeout: 1500 })
        }}
      >
        <Redo size={16} />
      </ToolbarButton>
      <HistoryButton />

      <ToolbarSeparator />

      <SettingsButton />
    </Toolbar>
  )
}
