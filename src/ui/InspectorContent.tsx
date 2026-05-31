import { AssetsToolbar } from './AssetsToolbar'
import { AssetsList } from './AssetsList'
import { TransformInspector } from './TransformInspector'

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
      <div className="shrink-0">
        <TransformInspector />
      </div>
    </div>
  )
}
