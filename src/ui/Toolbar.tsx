import { useStore } from '@nanostores/react'
import { Button, Toolbar as CladdToolbar, ToolbarSeparator } from '@cladd-ui/react'
import { $canRedo, $canUndo, redo, undo } from '../state/editorStore'
import { AddSubPartButton } from './AddSubPartButton'
import { AddPartButton } from './AddPartButton'
import { PartDataButton } from './PartDataButton'
import { ExportButton } from './ExportButton'
import { ViewButton } from './ViewButton'

/**
 * Top toolbar: part actions (add/import/part-data/export), the View popover
 * (camera snap + reference grids), and undo/redo. Transform-tool mode now lives
 * in the floating per-SubPart toolbar that appears when a SubPart is selected.
 */
export function EditorToolbar() {
  const canUndo = useStore($canUndo)
  const canRedo = useStore($canRedo)

  return (
    <CladdToolbar size="sm">
      <AddSubPartButton />
      <AddPartButton />
      <PartDataButton />
      <ExportButton />

      <ToolbarSeparator />

      <ViewButton />

      <Button size="sm" disabled={!canUndo} onClick={() => undo()}>
        Undo
      </Button>
      <Button size="sm" disabled={!canRedo} onClick={() => redo()}>
        Redo
      </Button>
    </CladdToolbar>
  )
}
