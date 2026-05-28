import { useEffect } from 'react'
import { ViewportCanvas } from './three/ViewportCanvas'
import { EditorToolbar } from './ui/Toolbar'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { MultiSelectToolbar } from './ui/MultiSelectToolbar'
import { RightPanel } from './ui/RightPanel'
import { WorkspaceLoadProgress } from './ui/LoadProgress'
import { ensureCatalogLoaded } from './state/catalogStore'
import { ensurePartCatalogLoaded } from './state/partCatalogStore'

function App() {
  useEffect(() => {
    void ensureCatalogLoaded()
    void ensurePartCatalogLoaded()
  }, [])

  return (
    <div className="fixed inset-0 bg-cladd-bg text-cladd-fg">
      <ViewportCanvas />

      {/* Top-center: part actions + view popover + undo/redo */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        <EditorToolbar />
      </div>

      {/* Below the main toolbar: per-selection tools, only when something is selected.
          The multi-select toolbar stacks beneath and appears only for 2+ selected. */}
      <div className="absolute left-1/2 top-16 flex -translate-x-1/2 flex-col items-center gap-2">
        <SelectionToolbar />
        <MultiSelectToolbar />
      </div>

      {/* Right: collapsible transform inspector + placed instances */}
      <RightPanel />

      {/* Bottom-center: live download progress for HDR environments */}
      <WorkspaceLoadProgress />
    </div>
  )
}

export default App
