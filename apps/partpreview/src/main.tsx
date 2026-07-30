import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { App } from './App'
import { ensureCatalogLoaded } from '../../../src/state/catalogStore'
import { ensurePartCatalogLoaded } from '../../../src/state/partCatalogStore'

// Both catalogs are needed: the Part catalog to find the requested part, the
// SubPart catalog to resolve its placements' template ids to meshes/materials.
void ensureCatalogLoaded()
void ensurePartCatalogLoaded()

// Deliberately none of the main app's boot sequence (project hydration, build-id
// check, share links, toasts): this app renders one built-in Part and owns no
// document state.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
