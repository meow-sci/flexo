import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CladdProvider } from '@cladd-ui/react'
import './index.css'
import App from './app.tsx'
import { hydrateProjectOnBoot } from './state/projectStore'
import { initModFolder } from './state/modFolderStore'

// Restore the current project into the editor stores BEFORE the first render, so
// the workspace paints once with the right data (no second visual refresh).
hydrateProjectOnBoot()

// Reflect any previously-granted mods folder (async; updates the export UI when ready).
void initModFolder()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CladdProvider>
      <App />
    </CladdProvider>
  </StrictMode>,
)
