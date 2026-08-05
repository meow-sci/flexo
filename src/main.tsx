import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app.tsx';
import { GlobalToastRegion, toast } from './ui/kit';
import { BuildIdMismatchDialog } from './ui/BuildIdMismatchDialog';
import { checkBuildId } from './buildCheck';
import { hydrateProjectOnBoot, loadSharedProject } from './state/projectStore';
import { clearShareParam, decodeSharePayload, readShareParam } from './state/projectShareLink';
import { suppressAboutFirstUse } from './state/aboutStore';
import { initCustomAssets } from './state/customAssetStore';
import { initAnimationStore } from './state/animationStore';
import { initModFolder } from './state/modFolderStore';
import { $containers, $activeContainerId } from './state/containerStore';
import { $measurements, $activeMeasurementId } from './state/measurementStore';
import { registerEditorAidStores } from './state/editorStore';
import { initModifierListeners } from './state/modifierStore';

// Wire containerStore and measurementStore into the undo/redo system. Must run
// before any user interactions (and before hydrateProjectOnBoot so the callbacks
// are in place if any undo/redo is triggered during load).
registerEditorAidStores({
  getContainers: () => $containers.get(),
  setContainers: (c) => {
    $containers.set(c);
    const active = $activeContainerId.get();
    if (active !== null && !c.some((x) => x.id === active)) $activeContainerId.set(null);
  },
  getMeasurements: () => $measurements.get(),
  setMeasurements: (m) => {
    $measurements.set(m);
    const active = $activeMeasurementId.get();
    if (active !== null && !m.some((x) => x.id === active)) $activeMeasurementId.set(null);
  },
});

// Restore the current project into the editor stores BEFORE the first render, so
// the workspace paints once with the right data (no second visual refresh).
hydrateProjectOnBoot();

// Wire custom-asset hydration AFTER the project is loaded so the immediate
// subscriber callback reads the real $part (not the initial empty part).
initCustomAssets();

// Keep the active animation/joint/keyframe selection clamped across undo/redo.
initAnimationStore();

// Track held modifier keys for the status bar's hint segment (design-system-services §1.4;
// §9 "boot order additions"). Idempotent, so StrictMode's double boot is harmless.
initModifierListeners();

// Detect a share-link launch up front: it changes how the next two startup steps behave.
const sharePayload = readShareParam();

if (sharePayload) {
  // Opening someone's shared project is an explicit "load this" action — don't ambush it
  // with the build-mismatch reset prompt, and don't auto-show the intro. We skip the build
  // check entirely (rather than just hiding its dialog) so the stored flexo_build_id is left
  // untouched and the safety prompt still fires on the user's next ordinary visit. Likewise
  // the intro stays unseen (flexo:aboutSeen unchanged) so it greets them next time.
  suppressAboutFirstUse();
} else {
  checkBuildId();
}

// Reflect any previously-granted mods folder (async; updates the export UI when ready).
void initModFolder();

// Stateless share links (`?load=<payload>`): decode the project and open it as a NEW
// project (the freshly-hydrated project stays untouched until this resolves). Async —
// decompression needs the Zstd WASM module — so it lands a beat after first paint.
if (sharePayload) {
  void (async () => {
    const result = await decodeSharePayload(sharePayload);
    clearShareParam();
    if (!result.ok) {
      toast({ title: 'Could not open shared link', description: result.error, variant: 'danger' });
      return;
    }
    const name = loadSharedProject(result.env);
    toast({ title: 'Opened shared project', description: name, variant: 'success' });
  })();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <GlobalToastRegion />
    <BuildIdMismatchDialog />
  </StrictMode>,
);
