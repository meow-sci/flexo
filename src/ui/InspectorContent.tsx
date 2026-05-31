import { AssetsToolbar } from './AssetsToolbar'
import { AssetsList } from './AssetsList'
import { TransformInspector } from './TransformInspector'
import { AnimationsPanel } from './AnimationsPanel'

/**
 * The body of the inspector: the Assets toolbar (Layers + Custom), the unified
 * Assets list (all listed layers, sectioned), and the transform inspector.
 * Shared between the desktop {@link RightPanel} and the mobile bottom-sheet
 * inspector so the inner stack stays consistent.
 */
export function InspectorContent() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <AssetsToolbar />
      <div className="min-h-0 flex-1">
        <AssetsList />
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <TransformInspector />
        <AnimationsPanel />
      </div>
    </div>
  )
}
