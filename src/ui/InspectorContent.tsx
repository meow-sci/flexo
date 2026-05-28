import { PlacementList } from './PlacementList'
import { TransformInspector } from './TransformInspector'

/**
 * The body of the inspector (placement list + transform inspector). Shared
 * between the desktop {@link RightPanel} and the mobile bottom-sheet inspector
 * so the inner stack stays consistent. The layers bar lives in the surrounding
 * shell (top row on desktop, sheet header on mobile).
 */
export function InspectorContent() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <PlacementList />
      </div>
      <div className="shrink-0">
        <TransformInspector />
      </div>
    </div>
  )
}
