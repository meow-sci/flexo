import { useStore } from '@nanostores/react'
import { Toolbar, ToolbarSeparator, ToggleButtonGroup, ToggleButton, Button } from './kit'
import { duplicateSelected, removeSelected, setToolMode, type ToolMode } from '../state/editorStore'
import { $hasSelection } from '../state/selectors'
import { $isPoseEditing } from '../state/animationStore'
import { $effectiveToolMode, $isExhaustPlacing } from '../state/engineStore'

const MODES: { mode: ToolMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
]

/**
 * Floating toolbar that appears centered below the main toolbar whenever anything is
 * selected (one or more SubParts, or a connector) OR while posing an animation joint OR
 * while placing a nozzle exhaust in 3D. Holds the transform tool mode (drives the 3D gizmo
 * via $toolMode) plus duplicate/delete. During pose editing and exhaust placement the
 * viewport selection is empty (the joint/nozzle lives in a sidebar panel), so without this
 * the Move/Rotate/Scale switcher would be hidden and the gizmo stuck on whichever tool was
 * last active — hence we also show it for those, but keep duplicate/delete gated on a real
 * selection.
 *
 * Scale is disabled while placing exhaust: a nozzle placement is a point plus a direction,
 * with nothing to scale. The switcher reads {@link $effectiveToolMode} (not `$toolMode`)
 * so it shows the tool the gizmo is ACTUALLY in — arriving here with Scale still selected
 * from an earlier edit displays Move, exactly as the gizmo behaves.
 */
export function SelectionToolbar() {
  const hasSelection = useStore($hasSelection)
  const isPoseEditing = useStore($isPoseEditing)
  const isExhaustPlacing = useStore($isExhaustPlacing)
  const mode = useStore($effectiveToolMode)

  if (!hasSelection && !isPoseEditing && !isExhaustPlacing) return null

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
          <ToggleButton
            key={m.mode}
            id={m.mode}
            size="sm"
            isDisabled={isExhaustPlacing && m.mode === 'scale'}
          >
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
