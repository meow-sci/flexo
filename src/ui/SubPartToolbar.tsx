import { useStore } from '@nanostores/react'
import {
  Button,
  Toolbar as CladdToolbar,
  Segmented,
  SegmentedButton,
  ToolbarSeparator,
} from '@cladd-ui/react'
import {
  $toolMode,
  duplicateSelected,
  removeSelected,
  setToolMode,
  type ToolMode,
} from '../state/editorStore'
import { $selectedPlacement } from '../state/selectors'

const MODES: { mode: ToolMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
]

/**
 * Floating toolbar that appears centered below the main toolbar only while a
 * SubPart is selected. Holds actions specific to that SubPart: the transform
 * tool mode (drives the 3D gizmo via $toolMode) plus duplicate/delete.
 */
export function SubPartToolbar() {
  const selected = useStore($selectedPlacement)
  const mode = useStore($toolMode)

  if (!selected) return null

  return (
    <CladdToolbar size="sm">
      <Segmented>
        {MODES.map((m) => (
          <SegmentedButton
            key={m.mode}
            active={m.mode === mode}
            onClick={() => setToolMode(m.mode)}
          >
            {m.label}
          </SegmentedButton>
        ))}
      </Segmented>

      <ToolbarSeparator />

      <Button size="sm" onClick={() => duplicateSelected()}>
        Duplicate
      </Button>
      <Button size="sm" color="red" onClick={() => removeSelected()}>
        Delete
      </Button>
    </CladdToolbar>
  )
}
