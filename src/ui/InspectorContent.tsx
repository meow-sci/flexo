import { AssetsToolbar } from './AssetsToolbar'
import { AssetsList } from './AssetsList'
import { TransformInspector } from './TransformInspector'
import { AnimationsPanel } from './AnimationsPanel'

/**
 * The body of the inspector: the Assets toolbar (Layers + Custom), the unified
 * Assets list (all listed layers, sectioned), and the Animations editor. Shared
 * between the desktop {@link RightPanel} and the mobile bottom-sheet inspector.
 *
 * The selected-asset {@link TransformInspector} is NOT part of this stack on desktop
 * — it floats over the workspace ({@link FloatingInspector}) so it can't push the
 * Animations editor off-screen. The phone sheet has no floating layer, so it opts
 * back in inline via {@link showTransform}.
 */
export function InspectorContent({ showTransform = false }: { showTransform?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <AssetsToolbar />
      <div className="min-h-0 flex-1">
        <AssetsList />
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        {showTransform && <TransformInspector />}
        <AnimationsPanel />
      </div>
    </div>
  )
}
