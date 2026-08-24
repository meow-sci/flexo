import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { App } from './App.tsx';
import { hydrateProjectOnBoot, initAutosave } from './state/projectStore.ts';
import { installDebugHandle } from './debug.ts';

if (import.meta.env.DEV) installDebugHandle();

// The scene and the nanostores are module-level singletons the live StaticScene
// captured at construction. A Vite HMR swap of those modules leaves the scene
// subscribed to the OLD instances while the UI writes the new ones — everything
// looks alive but nothing moves. Component files fast-refresh as usual; any
// update that bubbles to this entry does a FULL reload instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}

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
