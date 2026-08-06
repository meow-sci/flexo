import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app.tsx';
import { toast } from './ui/toast';
import { checkBuildId, initBuildMismatchNotice } from './buildCheck';
import { hydrateProjectOnBoot, loadSharedProject, purgeV1Storage } from './state/projectStore';
import { clearShareParam, decodeSharePayload, readShareParam } from './state/projectShareLink';
import { suppressAboutFirstUse } from './state/aboutStore';
import { initCustomAssets } from './state/customAssetStore';
import { initAnimationStore } from './state/animationStore';
import { initModFolder } from './state/modFolderStore';
import { $containers, $activeContainerId } from './state/containerStore';
import { $measurements, $activeMeasurementId } from './state/measurementStore';
import { registerEditorAidStores } from './state/editorStore';
import { initModifierListeners } from './state/modifierStore';
import { initHotkeyStore } from './state/hotkeyStore';
import { applySnapToGizmo } from './state/snapStore';
import { initDataMode } from './state/dataModeStore';
import { initEngineMode } from './state/engineStore';
import { initSurfaceMode } from './state/surfaceModeStore';

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

// Data mode's entry choreography: the foundation §2.4 scope ladder plus the reaction-catalog
// preload (the one sanctioned mode-entry effect — read-only, idempotent). Wired from boot so
// the registration cannot depend on which component imported the store first.
initDataMode();

// Engine mode's entry choreography: the §B2 scope ladder (restore / selection / the only
// engine), the define-new jump payload and the same reaction-catalog preload. Exit needs no
// hook — the tool slot and EditorScene own that teardown (see initEngineMode).
initEngineMode();

// Surface mode's entry choreography (foundation §2.4: jump payload → selected custom-mesh
// placement → the surviving pick) plus the `$part` clamp that drops a pick whose mesh was
// undone away. Same reasoning as the two above — wired from boot, never at module scope.
initSurfaceMode();

/**
 * The rest of boot is one async IIFE because project hydration is now AWAITED: projects live
 * in IndexedDB (LOCKED #3), which is async, and the single-paint property is preserved by
 * awaiting BEFORE `createRoot().render()` rather than by reading synchronously. Nothing
 * renders until the workspace is in place; the HTML background shows for the few ms an IDB
 * read takes (design-projects-export.md §1.7). Step ORDER is unchanged from v1.
 */
void (async () => {
  // Delete v1's name-keyed localStorage projects, naming them in one notification. There is
  // no adoption path and none may be added (DECISIONS #3 — projects are a clean slate).
  purgeV1Storage();

  // Restore the current project into the editor stores BEFORE the first render, so
  // the workspace paints once with the right data (no second visual refresh).
  await hydrateProjectOnBoot();

  // Wire custom-asset hydration AFTER the project is loaded so the immediate
  // subscriber callback reads the real $part and $currentProjectId (blob keys are
  // namespaced by the project id).
  initCustomAssets();

  // Keep the active animation/joint/keyframe selection clamped across undo/redo.
  initAnimationStore();

  // Track held modifier keys for the status bar's hint segment (design-system-services §1.4;
  // §9 "boot order additions"). Idempotent, so StrictMode's double boot is harmless.
  initModifierListeners();

  // Track which surface owns focus, so the scoped hotkey registry can gate `surface:*`
  // bindings on it (design-system-services §4.2). Same idempotent-guard pattern.
  initHotkeyStore();

  // Push the persisted snap settings into the gizmo once, before the first drag: `$snap` is
  // ephemeral (it is the gizmo's live setting), so without this the magnet would read "on"
  // after a reload while nothing actually snapped (design-build-mode.md §4.1).
  applySnapToGizmo(false);

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
    // S26: a mismatch posts a sticky NOTIFICATION with [Reload] / [Reset everything…]; the
    // v1 boot modal is gone, and nothing about a redeploy blocks startup.
    initBuildMismatchNotice();
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
        toast({
          title: 'Could not open shared link',
          description: result.error,
          variant: 'danger',
        });
        return;
      }
      const name = await loadSharedProject(result.env);
      toast({ title: 'Opened shared project', description: name, variant: 'success' });
    })();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
