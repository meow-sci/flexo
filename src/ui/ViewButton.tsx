import { useStore } from '@nanostores/react'
import {
  Button,
  Checkbox,
  Popover,
  PopoverRoot,
  PopoverTrigger,
  SectionTitle,
  ToolbarButton,
} from '@cladd-ui/react'
import {
  $grids,
  setGrid,
  snapCamera,
  type Axis,
  type CameraDir,
} from '../state/viewStore'
import { PreciseNumberInput } from './PreciseNumberInput'

const SNAP_ROWS: [CameraDir, CameraDir][] = [
  ['left', 'right'],
  ['front', 'back'],
  ['top', 'bottom'],
]

const GRID_AXES: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
]

/**
 * Top-surface "View" action: a Popover with camera-snap buttons (snap to an
 * axis-aligned view, keeping the current zoom) and per-axis reference grids
 * (checkbox + meters spacing). Both drive the three.js layer via viewStore.
 */
export function ViewButton() {
  const grids = useStore($grids)

  return (
    <PopoverRoot>
      <PopoverTrigger>
        <ToolbarButton>View</ToolbarButton>
      </PopoverTrigger>
      <Popover position="bottom" className="w-64 rounded-lg" contentClassName="p-3">
        <SectionTitle>Camera Snap</SectionTitle>
        <div className="mt-2 flex flex-col gap-1.5">
          {SNAP_ROWS.map(([a, b]) => (
            <div key={a} className="flex gap-1.5">
              <Button size="sm" className="flex-1 capitalize" onClick={() => snapCamera(a)}>
                {a}
              </Button>
              <Button size="sm" className="flex-1 capitalize" onClick={() => snapCamera(b)}>
                {b}
              </Button>
            </div>
          ))}
        </div>

        <SectionTitle className="mt-4">Grids</SectionTitle>
        <div className="mt-2 flex flex-col gap-2">
          {GRID_AXES.map(({ axis, label }) => {
            const cfg = grids[axis]
            return (
              <div key={axis} className="flex items-center gap-2">
                <Checkbox
                  size="sm"
                  checked={cfg.enabled}
                  onChange={(enabled) => setGrid(axis, { enabled })}
                />
                <span className="w-4 text-cladd-sm text-cladd-fg-soft">{label}</span>
                <PreciseNumberInput
                  className="flex-1"
                  min={0.05}
                  value={cfg.spacing}
                  onCommit={(spacing) => setGrid(axis, { spacing })}
                />
                <span className="text-xs text-cladd-fg-softer">m</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </PopoverRoot>
  )
}
