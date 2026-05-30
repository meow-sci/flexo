import { useEffect } from 'react'
import { ViewportCanvas } from './three/ViewportCanvas'
import { EditorToolbar } from './ui/Toolbar'
import { MobileTopBar } from './ui/MobileTopBar'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { MultiSelectToolbar } from './ui/MultiSelectToolbar'
import { RightPanel } from './ui/RightPanel'
import { MobileInspector } from './ui/MobileInspector'
import { WorkspaceLoadProgress } from './ui/LoadProgress'
import { MeasurementInfo } from './ui/MeasurementInfo'
import { MeasurementEditor } from './ui/MeasurementEditor'
import { NudgeToolbar } from './ui/NudgeToolbar'
import { GlobalHotkeys } from './ui/hotkeys/GlobalHotkeys'
import { HelpDialog } from './ui/hotkeys/HelpDialog'
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

      {/* Editor for the active line measurement (left card on desktop, bottom
          sheet on phone — handled within the component). */}
      <MeasurementEditor />

      {/* Bottom-left: live selection bounding-box dimensions. */}
      <MeasurementInfo />

      {/* Bottom-center: live download progress for HDR environments. */}
      <WorkspaceLoadProgress />

      {/* Bottom-center bubble: active nudge plane + step (arrow-key tool). */}
      <NudgeToolbar />
    </div>
  )
}

export default App
