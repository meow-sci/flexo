import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { GlobalToastRegion } from './ui/kit'
import { BuildIdMismatchDialog } from './ui/BuildIdMismatchDialog'
import { checkBuildId } from './buildCheck'
import { hydrateProjectOnBoot } from './state/projectStore'
import { initModFolder } from './state/modFolderStore'
import { $containers, $activeContainerId } from './state/containerStore'
import { $measurements, $activeMeasurementId } from './state/measurementStore'
import { registerEditorAidStores } from './state/editorStore'

// Wire containerStore and measurementStore into the undo/redo system. Must run
// before any user interactions (and before hydrateProjectOnBoot so the callbacks
// are in place if any undo/redo is triggered during load).
registerEditorAidStores({
  getContainers: () => $containers.get(),
  setContainers: (c) => {
    $containers.set(c)
    const active = $activeContainerId.get()
    if (active !== null && !c.some((x) => x.id === active)) $activeContainerId.set(null)
  },
  getMeasurements: () => $measurements.get(),
  setMeasurements: (m) => {
    $measurements.set(m)
    const active = $activeMeasurementId.get()
    if (active !== null && !m.some((x) => x.id === active)) $activeMeasurementId.set(null)
  },
})

// Restore the current project into the editor stores BEFORE the first render, so
// the workspace paints once with the right data (no second visual refresh).
hydrateProjectOnBoot()

checkBuildId()

// Reflect any previously-granted mods folder (async; updates the export UI when ready).
void initModFolder()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <GlobalToastRegion />
    <BuildIdMismatchDialog />
  </StrictMode>,
)
