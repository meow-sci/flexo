import { useEffect } from 'react'
import { ViewportCanvas } from './three/ViewportCanvas'
import { EditorToolbar } from './ui/Toolbar'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { RightPanel } from './ui/RightPanel'
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

      {/* Below the main toolbar: per-selection tools, only when something is selected */}
      <div className="absolute left-1/2 top-16 -translate-x-1/2">
        <SelectionToolbar />
      </div>

      {/* Right: collapsible transform inspector + placed instances */}
      <RightPanel />
    </div>
  )
}

export default App
