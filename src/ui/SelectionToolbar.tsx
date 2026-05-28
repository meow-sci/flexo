import { useStore } from '@nanostores/react'
import { Toolbar, ToolbarSeparator, ToggleButtonGroup, ToggleButton, Button } from './kit'
import {
  $toolMode,
  duplicateSelected,
  removeSelected,
  setToolMode,
  type ToolMode,
} from '../state/editorStore'
import { $hasSelection } from '../state/selectors'

const MODES: { mode: ToolMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
]

/**
 * Floating toolbar that appears centered below the main toolbar whenever
 * anything is selected (one or more SubParts, or a connector). Holds the
 * transform tool mode (drives the 3D gizmo via $toolMode) plus duplicate/delete,
 * all of which act on the whole selection.
 */
export function SelectionToolbar() {
  const hasSelection = useStore($hasSelection)
  const mode = useStore($toolMode)

  if (!hasSelection) return null

  return (
    <Toolbar aria-label="Selection actions">
      <ToggleButtonGroup
        className="w-auto"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[mode]}
        onSelectionChange={(keys) => {
          const next = [...keys][0]
          if (next) setToolMode(next as ToolMode)
        }}
      >
        {MODES.map((m) => (
          <ToggleButton key={m.mode} id={m.mode} size="sm">
            {m.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <ToolbarSeparator />

      <Button size="sm" onPress={() => duplicateSelected()}>
        Duplicate
      </Button>
      <Button size="sm" variant="danger" onPress={() => removeSelected()}>
        Delete
      </Button>
    </Toolbar>
  )
}
