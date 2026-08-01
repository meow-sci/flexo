import { useStore } from '@nanostores/react';
import { AssetsToolbar } from './AssetsToolbar';
import { AssetsList } from './AssetsList';
import { TransformInspector } from './TransformInspector';
import { AnimToolbar } from './AnimToolbar';
import { AnimationPanel } from './AnimationPanel';
import { EngineToolbar } from './EngineToolbar';
import { EnginePanel } from './EnginePanel';
import { $inspectorMode } from '../state/uiStore';

/**
 * The body of the inspector. Two modes (driven by {@link $inspectorMode}):
 *  - 'assets': the Assets toolbar (Layers + Custom + Anim) and the unified Assets
 *    list (all listed layers, sectioned).
 *  - 'anim': the full-sidebar Animation editor (the Assets list is hidden; parts are
 *    reachable via the Mesh Picker dialog in the {@link AnimToolbar}).
 * Shared between the desktop {@link RightPanel} and the mobile bottom-sheet inspector.
 *
 * The selected-asset {@link TransformInspector} is NOT part of this stack on desktop
 * — it floats over the workspace ({@link FloatingInspector}). The phone sheet has no
 * floating layer, so it opts back in inline via {@link showTransform} (assets mode only).
 */
export function InspectorContent({ showTransform = false }: { showTransform?: boolean }) {
  const mode = useStore($inspectorMode);

  if (mode === 'anim') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AnimToolbar />
        <div className="min-h-0 flex-1">
          <AnimationPanel />
        </div>
      </div>
    );
  }

  if (mode === 'engine') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <EngineToolbar />
        <div className="min-h-0 flex-1">
          <EnginePanel />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <AssetsToolbar />
      <div className="min-h-0 flex-1">
        <AssetsList />
      </div>
      {showTransform && (
        <div className="flex shrink-0 flex-col gap-2">
          <TransformInspector />
        </div>
      )}
    </div>
  );
}
