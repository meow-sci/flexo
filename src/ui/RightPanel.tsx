import { useStore } from '@nanostores/react'
import { Button, Surface, Tooltip } from '@cladd-ui/react'
import { TransformInspector } from './TransformInspector'
import { PlacementList } from './PlacementList'
import {
  $inspectorVisible,
  $inspectorWidth,
  setInspectorVisible,
  setInspectorWidth,
} from '../state/uiStore'

/** A panel-with-divided-right-column glyph that reads as an inspector panel. */
function InspectorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </svg>
  )
}

/**
 * Thin grab strip on the panel's left edge. Dragging left widens the panel,
 * dragging right narrows it; the width is clamped + persisted by setInspectorWidth.
 */
function ResizeHandle() {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = $inspectorWidth.get()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      setInspectorWidth(startWidth - (ev.clientX - startX))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="group absolute -left-1 top-0 bottom-0 z-10 w-2 cursor-col-resize"
      aria-label="Resize inspector"
    >
      <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-cladd-fg-soft" />
    </div>
  )
}

/**
 * The right-side editor inspector. A single surface holds two sub-surfaces: the
 * placed-instance + connector list on top (scrolls when long) and the transform
 * inspector below at its natural height (the focus when something is selected).
 * A left-edge drag handle resizes the panel; visibility and width persist via
 * uiStore. The hide/show toggle keeps a fixed top-right position in both states.
 */
export function RightPanel() {
  const visible = useStore($inspectorVisible)
  const width = useStore($inspectorWidth)

  const toggleButton = (
    <Tooltip tooltip={visible ? 'Hide inspector' : 'Show inspector'}>
      <Button
        square
        rounded
        size="sm"
        variant="solid"
        onClick={() => setInspectorVisible(!visible)}
        aria-label={visible ? 'Hide inspector' : 'Show inspector'}
      >
        <InspectorIcon />
      </Button>
    </Tooltip>
  )

  if (!visible) {
    return <div className="absolute right-3 top-3">{toggleButton}</div>
  }

  return (
    <div className="absolute right-3 top-3 bottom-3 flex flex-col gap-2" style={{ width }}>
      <ResizeHandle />
      <div className="flex shrink-0 justify-end">{toggleButton}</div>
      <Surface
        outline
        className="flex min-h-0 flex-1 flex-col rounded-xl"
        contentClassName="flex min-h-0 flex-1 flex-col gap-2 p-2"
      >
        <div className="min-h-0 flex-1">
          <PlacementList />
        </div>
        <div className="shrink-0">
          <TransformInspector />
        </div>
      </Surface>
    </div>
  )
}
