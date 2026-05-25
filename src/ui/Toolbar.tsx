import { useStore } from '@nanostores/react'
import { Toolbar as CladdToolbar, ToolbarButton, ToolbarSeparator, useToast } from '@cladd-ui/react'
import { Undo, Redo } from 'lucide-react'
import { $canRedo, $canUndo, redo, undo } from '../state/editorStore'
import { AddButton } from './AddButton'
import { PartDataButton } from './PartDataButton'
import { ExportButton } from './ExportButton'
import { ViewButton } from './ViewButton'
import { SettingsButton } from './SettingsButton'

/**
 * Top toolbar: part actions (add/import/part-data/export), the View popover
 * (camera snap + reference grids), and undo/redo. Transform-tool mode now lives
 * in the floating per-SubPart toolbar that appears when a SubPart is selected.
 */
export function EditorToolbar() {
  const canUndo = useStore($canUndo)
  const canRedo = useStore($canRedo)
  const toast = useToast()

  return (
    <CladdToolbar size="sm">
      <AddButton />
      <PartDataButton />
      <ExportButton />

      <ToolbarSeparator />

      <ViewButton />

      <ToolbarSeparator />

      <ToolbarButton disabled={!canUndo} onClick={() => { undo(); toast({ title: 'Undo', timeout: 1500 }) }}>
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton disabled={!canRedo} onClick={() => { redo(); toast({ title: 'Redo', timeout: 1500 }) }}>
        <Redo size={16} />
      </ToolbarButton>

      <ToolbarSeparator />

      <SettingsButton />
    </CladdToolbar>
  )
}
