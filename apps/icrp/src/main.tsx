import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { App } from './App.tsx';
import { hydrateProjectOnBoot, initAutosave } from './state/projectStore.ts';

// Hydrate BEFORE the first render so the workspace paints once with the right
// data (flexo's single-paint boot rule); autosave wires after hydration.
void (async () => {
  await hydrateProjectOnBoot();
  initAutosave();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
