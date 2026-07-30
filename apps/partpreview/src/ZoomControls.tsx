import { Minus, Plus } from 'lucide-react'
import { Button } from '../../../src/ui/kit'

/**
 * Floating +/− buttons for visitors without a mouse wheel (touch pinch and wheel
 * zoom both already work through OrbitControls).
 */
export function ZoomControls({ onZoom }: { onZoom: (factor: number) => void }) {
  // `zoomBy` scales the camera's DISTANCE to the target: >1 moves away (zoom out),
  // <1 moves closer (zoom in). Do not "fix" these to read the other way around.
  return (
    <div className="absolute bottom-2 right-2 flex gap-1">
      <Button
        size="sm"
        iconOnly
        variant="secondary"
        aria-label="Zoom out"
        onPress={() => onZoom(1.25)}
      >
        <Minus size={14} />
      </Button>
      <Button
        size="sm"
        iconOnly
        variant="secondary"
        aria-label="Zoom in"
        onPress={() => onZoom(1 / 1.25)}
      >
        <Plus size={14} />
      </Button>
    </div>
  )
}
