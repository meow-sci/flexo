import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { App } from './App'

// Deliberately none of the main app's boot sequence (project hydration, build-id
// check, share links, toasts): this app renders one built-in Part and owns no
// document state.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
