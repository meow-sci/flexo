import { useEffect } from 'react'
import { ViewportCanvas } from './three/ViewportCanvas'
import { EditorToolbar } from './ui/Toolbar'
import { MobileTopBar } from './ui/MobileTopBar'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { MultiSelectToolbar } from './ui/MultiSelectToolbar'
import { RightPanel } from './ui/RightPanel'
import { MobileInspector } from './ui/MobileInspector'
import { FloatingInspector } from './ui/FloatingInspector'
import { FloatingPreviewToolbar } from './ui/FloatingPreviewToolbar'
import { WorkspaceLoadProgress } from './ui/LoadProgress'
import { MeasurementInfo } from './ui/MeasurementInfo'
import { MeasurementEditor } from './ui/MeasurementEditor'
import { ContainerEditor } from './ui/ContainerEditor'
import { ManageTexturesPanel } from './ui/ManageTexturesPanel'
import { GlowPaintDialog } from './ui/GlowPaintDialog'
import { TransformHud } from './ui/TransformHud'
import { GlobalHotkeys } from './ui/hotkeys/GlobalHotkeys'
import { HelpDialog } from './ui/hotkeys/HelpDialog'
import { AboutDialog } from './ui/AboutDialog'
import { useIsPhone } from './ui/kit'
import { ensureCatalogLoaded } from './state/catalogStore'
import { ensurePartCatalogLoaded } from './state/partCatalogStore'

function App() {
  const isPhone = useIsPhone()

  useEffect(() => {
    void ensureCatalogLoaded()
    void ensurePartCatalogLoaded()
  }, [])

  return (
    <div className="fixed inset-0 bg-canvas text-fg">
      {/* Global keyboard shortcuts (no UI) + the help overlay they open. */}
      <GlobalHotkeys />
      <HelpDialog />
      <AboutDialog />

      <ViewportCanvas />

      {/* Top: floating, centered editor toolbar on desktop/tablet; full-width
          compact bar with an overflow menu on phone. */}
      {isPhone ? (
        <div className="absolute inset-x-0 top-0">
          <MobileTopBar />
        </div>
      ) : (
        // Center the toolbar at desktop widths; below `lg` left-align it with a
        // right boundary that reserves room for the inspector. Combined with
        // flex-wrap inside, the toolbar gracefully spans two rows on portrait
        // tablets instead of being clipped by the inspector.
        <div className="absolute left-3 top-3 right-[19rem] lg:right-auto lg:left-1/2 lg:-translate-x-1/2">
          <EditorToolbar />
        </div>
      )}

      {/* Below the top toolbar: per-selection tools, only when something is
          selected. The multi-select toolbar stacks beneath. */}
      <div
        className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 ${
          isPhone ? 'top-14' : 'top-16'
        }`}
      >
        <SelectionToolbar />
        <MultiSelectToolbar />
      </div>

      {/* Inspector: right-side resizable panel on desktop, bottom sheet on phone. */}
      {isPhone ? <MobileInspector /> : <RightPanel />}

      {/* Selected-asset details as a floating, draggable window over the workspace
          (desktop only — the phone sheet keeps it inline). */}
      {!isPhone && <FloatingInspector />}

      {/* Floating, draggable animation preview scrubber over the workspace while the
          Animation editor has a clip open (desktop only — phone keeps it inline). */}
      {!isPhone && <FloatingPreviewToolbar />}

      {/* Editor for the active line measurement (left card on desktop, bottom
          sheet on phone — handled within the component). */}
      <MeasurementEditor />

      {/* Editor for the active reference container (same placement as above). */}
      <ContainerEditor />

      {/* Floating per-mesh material editor (glow / visor surface / per-face textures). */}
      <ManageTexturesPanel />

      {/* Modal paint canvas for a mesh's 'painted' glow bitmap. */}
      <GlowPaintDialog />

      {/* Bottom-left: live selection bounding-box dimensions. */}
      <MeasurementInfo />

      {/* Bottom-center: live download progress for HDR environments. */}
      <WorkspaceLoadProgress />

      {/* Bottom-center bubble: rotate-key axes/step + arrow-key nudge axis/step. */}
      <TransformHud />
    </div>
  )
}

export default App
