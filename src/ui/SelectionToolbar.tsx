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
import { $isPoseEditing } from '../state/animationStore'

const MODES: { mode: ToolMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
]

/**
 * Floating toolbar that appears centered below the main toolbar whenever anything is
 * selected (one or more SubParts, or a connector) OR while posing an animation joint.
 * Holds the transform tool mode (drives the 3D gizmo via $toolMode) plus
 * duplicate/delete. During pose editing the viewport selection is empty (the joint +
 * keyframe live in the Animations panel), so without this the Move/Rotate/Scale switcher
 * would be hidden and the pose gizmo stuck on whichever tool was last active — hence we
 * also show it for $isPoseEditing, but keep duplicate/delete gated on a real selection.
 */
export function SelectionToolbar() {
  const hasSelection = useStore($hasSelection)
  const isPoseEditing = useStore($isPoseEditing)
  const mode = useStore($toolMode)

  if (!hasSelection && !isPoseEditing) return null

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

      {hasSelection && (
        <>
          <ToolbarSeparator />

          <Button size="sm" onPress={() => duplicateSelected()}>
            Duplicate
          </Button>
          <Button size="sm" variant="danger" onPress={() => removeSelected()}>
            Delete
          </Button>
        </>
      )}
    </Toolbar>
  )
}
