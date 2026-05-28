import { useStore } from '@nanostores/react'
import { PanelRight } from 'lucide-react'
import { Button, Toolbar, Tooltip } from './kit'
import { InspectorContent } from './InspectorContent'
import { LayersButton } from './LayersButton'
import {
  $inspectorVisible,
  $inspectorWidth,
  setInspectorVisible,
  setInspectorWidth,
} from '../state/uiStore'

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
      <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-border-strong" />
    </div>
  )
}

/**
 * Desktop right-side inspector. A left-edge drag handle resizes the panel;
 * visibility and width persist via uiStore. The phone variant is a bottom sheet
 * — see {@link MobileInspector}.
 */
export function RightPanel() {
  const visible = useStore($inspectorVisible)
  const width = useStore($inspectorWidth)

  const toggleButton = (
    <Tooltip content={visible ? 'Hide inspector' : 'Show inspector'}>
      <Button
        iconOnly
        size="sm"
        variant="secondary"
        onPress={() => setInspectorVisible(!visible)}
        aria-label={visible ? 'Hide inspector' : 'Show inspector'}
      >
        <PanelRight className="size-4" />
      </Button>
    </Tooltip>
  )

  if (!visible) {
    return <div className="absolute right-3 top-3">{toggleButton}</div>
  }

  return (
    <div className="absolute right-3 top-3 bottom-3 flex flex-col gap-2" style={{ width }}>
      <ResizeHandle />
      <div className="flex shrink-0 items-center gap-2">
        <Toolbar aria-label="Layers" className="min-w-0 flex-1">
          <LayersButton />
        </Toolbar>
        {toggleButton}
      </div>
      <div className="min-h-0 flex-1">
        <InspectorContent />
      </div>
    </div>
  )
}
