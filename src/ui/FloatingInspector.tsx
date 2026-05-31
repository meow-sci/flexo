import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { GripHorizontal } from 'lucide-react'
import { TransformInspector } from './TransformInspector'
import { $selectedEntity, $selectionCount } from '../state/selectors'
import { $inspectorFloatPos, setInspectorFloatPos } from '../state/uiStore'

/**
 * The selected-asset details (transform / connector flags / bulk transform) as a
 * floating, draggable window over the 3D workspace — instead of stacked in the
 * right panel, where it used to push the animation editor off-screen when a part
 * got selected.
 *
 * Defaults to the bottom-left corner ({@link MARGIN} off both edges). Dragging the
 * header moves it freely; the position is persisted ({@link $inspectorFloatPos}) and
 * reset by the global data reset. Renders nothing when there is no selection (the
 * inner {@link TransformInspector} would be empty). Desktop only — the phone build
 * keeps the inspector inline in its bottom sheet.
 */

/** Default inset from the workspace edges, in px (0.25rem). */
const MARGIN = 4
/** Keep at least this much of the window on-screen when dragging/after a resize. */
const KEEP_VISIBLE_X = 80
const KEEP_VISIBLE_Y = 28

export function FloatingInspector() {
  const count = useStore($selectionCount)
  const entity = useStore($selectedEntity)
  const stored = useStore($inspectorFloatPos)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)

  // Mirror TransformInspector's own visibility: bulk panel (2+) or a single entity.
  const hasContent = count > 1 || entity != null
  if (!hasContent) return null

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const win = e.currentTarget.parentElement as HTMLElement
    const rect = win.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const baseLeft = rect.left
    const baseTop = rect.top
    e.currentTarget.setPointerCapture(e.pointerId)

    const compute = (ev: PointerEvent) => {
      const maxX = window.innerWidth - KEEP_VISIBLE_X
      const maxY = window.innerHeight - KEEP_VISIBLE_Y
      return {
        x: Math.max(0, Math.min(maxX, baseLeft + (ev.clientX - startX))),
        y: Math.max(0, Math.min(maxY, baseTop + (ev.clientY - startY))),
      }
    }
    const onMove = (ev: PointerEvent) => setDrag(compute(ev))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setInspectorFloatPos(compute(ev))
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const pos = drag ?? stored
  // null → default bottom-left anchor; otherwise clamp the stored top-left into view
  // (covers a viewport that shrank since the position was saved).
  const style: React.CSSProperties = pos
    ? {
        left: Math.max(0, Math.min(pos.x, window.innerWidth - KEEP_VISIBLE_X)),
        top: Math.max(0, Math.min(pos.y, window.innerHeight - KEEP_VISIBLE_Y)),
      }
    : { left: MARGIN, bottom: MARGIN }

  return (
    <div data-floating-inspector className="pointer-events-auto absolute z-30 flex w-72 flex-col gap-1" style={style}>
      <div
        onPointerDown={onHeaderPointerDown}
        className="flex cursor-grab touch-none select-none items-center gap-1.5 rounded-lg border border-border bg-panel/95 px-2 py-1 shadow-popover backdrop-blur-md active:cursor-grabbing"
      >
        <GripHorizontal size={13} className="text-fg-subtle" />
        <span className="flex-1 text-xs font-medium text-fg-subtle">Selection</span>
      </div>
      <div className="max-h-[calc(100dvh-6rem)] overflow-auto">
        <TransformInspector />
      </div>
    </div>
  )
}
