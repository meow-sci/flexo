import { useEffect } from 'react';
import { ViewportCanvas } from './three/ViewportCanvas';
import { ViewportDropZone } from './ui/ViewportDropZone';
import { ImportModelDialog } from './ui/ImportModelDialog';
import { ImportReportCard } from './ui/ImportReportCard';
import { EditorToolbar } from './ui/Toolbar';
import { MobileTopBar } from './ui/MobileTopBar';
import { SelectionToolbar } from './ui/SelectionToolbar';
import { MultiSelectToolbar } from './ui/MultiSelectToolbar';
import { InspectorContent } from './ui/InspectorContent';
import { MobileInspector } from './ui/MobileInspector';
import { FloatingInspector } from './ui/FloatingInspector';
import { FloatingPreviewToolbar } from './ui/FloatingPreviewToolbar';
import { SeatViewBar } from './ui/SeatViewBar';
import { WorkspaceLoadProgress } from './ui/LoadProgress';
import { MeasurementInfo } from './ui/MeasurementInfo';
import { MeasurementEditor } from './ui/MeasurementEditor';
import { ContainerEditor } from './ui/ContainerEditor';
import { ManageTexturesPanel } from './ui/ManageTexturesPanel';
import { GlowPaintDialog } from './ui/GlowPaintDialog';
import { TransformHud } from './ui/TransformHud';
import { ChainPalette } from './ui/chain/ChainPalette';
import { GlobalHotkeys } from './ui/hotkeys/GlobalHotkeys';
import { HelpDialog } from './ui/hotkeys/HelpDialog';
import { AboutDialog } from './ui/AboutDialog';
import { MenuBar } from './ui/shell/MenuBar';
import { Sidebar } from './ui/shell/Sidebar';
import { StatusBar } from './ui/status/StatusBar';
import { toast, useIsPhone, z } from './ui/kit';
import { ensureCatalogLoaded } from './state/catalogStore';
import { ensurePartCatalogLoaded } from './state/partCatalogStore';
import { consumeRemovedProjectsNotice } from './state/projectStore';

/**
 * The v2 docked shell (foundation.md §1):
 * `column( MenuBar, row( LeftSidebar, ViewportHost, RightSidebar ), StatusBar )`.
 *
 * Everything is a real flex sibling, so the canvas cell gets exactly the remaining
 * space and the orbit center IS the visible center — the v1 click-through RightPanel
 * overlay and the toolbar's hard-coded right-side reservation are both gone.
 *
 * The legacy floating chrome (old toolbar, selection toolbars, floating windows, HUDs,
 * aid editors) is unchanged and simply re-parented INSIDE the canvas cell, so its
 * `absolute` anchors now resolve against the workspace instead of the whole window.
 * Each surface is replaced by its v2 home in a later phase (foundation §17).
 */
function App() {
  const isPhone = useIsPhone();

  useEffect(() => {
    void ensureCatalogLoaded();
    void ensurePartCatalogLoaded();
  }, []);

  // Boot purged saved projects written by an incompatible schema version (see
  // projectStore.PROJECT_SCHEMA_VERSION) — tell the user which ones vanished. The notice
  // is consumed, so a remount never repeats it.
  useEffect(() => {
    const removed = consumeRemovedProjectsNotice();
    if (removed.length === 0) return;
    toast(
      {
        title: `Removed ${removed.length} incompatible saved project${removed.length === 1 ? '' : 's'}`,
        description: `${removed.join(', ')} — saved by an older, incompatible version of flexo.`,
        variant: 'warning',
      },
      { timeout: 10000 },
    );
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas text-fg">
      {/* Global keyboard shortcuts (no UI) + the help overlay they open. */}
      <GlobalHotkeys />
      <HelpDialog />
      <AboutDialog />

      {/* Top row: the slim docked menubar on desktop; the phone's full-width compact
          bar with an overflow menu, now IN FLOW rather than absolutely positioned. */}
      {!isPhone && <MenuBar />}
      {isPhone && <MobileTopBar />}

      {/* The workspace band (foundation §6.2): everything between the two bars.
          FloatingWindow tenants (later phase) mount inside this element. */}
      <div data-workspace-band className="relative flex min-h-0 flex-1">
        {!isPhone && (
          <Sidebar side="left">
            {/* Interim placeholder — the focus editor (foundation §7) arrives with the
                Build-mode rehost phase. */}
            <div className="p-(--density-panel-p) text-xs text-fg-subtle">Nothing selected</div>
          </Sidebar>
        )}

        {/* The canvas cell. Canvas fills it exactly ⇒ orbit center == visible center.
            Min size per foundation §1.1. */}
        <div data-viewport-cell className="relative min-h-[180px] min-w-[240px] flex-1">
          {/* The 3D workspace, wrapped so a dropped .glb opens the import dialog. The
              drop zone wraps the CELL only — a drop on a sidebar does nothing. */}
          <ViewportDropZone>
            <ViewportCanvas />
          </ViewportDropZone>

          {/* ── Legacy floating chrome, re-parented: absolute anchors now resolve
                against the CELL, so everything clamps to the workspace by construction.
                Each surface keeps self-gating exactly as before. ── */}

          {/* Top-center: the v1 editor toolbar. Plain centering is correct at every
              width now that the cell excludes the sidebars (the toolbar's own
              flex-wrap still handles narrow cells). */}
          {!isPhone && (
            <div
              className="absolute left-1/2 top-3 -translate-x-1/2"
              style={{ zIndex: z.canvasOverlay }}
            >
              <EditorToolbar />
            </div>
          )}

          {/* Below the top toolbar: per-selection tools, only when something is
              selected. The multi-select toolbar stacks beneath. On phone the animation
              scrubber pins to the top of this stack so the clip can be scrubbed/replayed
              without opening the inspector sheet over the 3D view. */}
          <div
            className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 ${
              isPhone ? 'top-2' : 'top-16'
            }`}
          >
            {isPhone && <FloatingPreviewToolbar />}
            <SelectionToolbar />
            <MultiSelectToolbar />
          </div>

          {/* Phone inspector: a FAB in the cell's corner opening a bottom sheet. The
              desktop inspector is the right sidebar below. */}
          {isPhone && <MobileInspector />}

          {/* Selected-asset details as a floating, draggable window over the workspace
              (desktop only — the phone sheet keeps it inline). */}
          {!isPhone && <FloatingInspector />}

          {/* Floating, draggable animation preview scrubber over the workspace while the
              Animation editor has a clip open (desktop only — the phone variant pins into
              the top toolbar stack above). */}
          {!isPhone && <FloatingPreviewToolbar />}

          {/* Bottom-center: seat cycle + exit while sitting in an IVA seat. Phone and
              desktop alike — in seat view the viewport IS the UI. */}
          <SeatViewBar />

          {/* Editor for the active line measurement (left card on desktop, bottom
              sheet on phone — handled within the component). */}
          <MeasurementEditor />

          {/* Editor for the active reference container (same placement as above). */}
          <ContainerEditor />

          {/* Floating per-mesh material editor (glow / visor surface / per-face textures). */}
          <ManageTexturesPanel />

          {/* Bottom-right: what the last import/replace created, matched and removed.
              Dismissible, non-modal, never focus-stealing. */}
          <ImportReportCard />

          {/* Bottom-left: live selection bounding-box dimensions. */}
          <MeasurementInfo />

          {/* Bottom-center: live download progress for HDR environments. */}
          <WorkspaceLoadProgress />

          {/* Bottom-center bubble: rotate-key axes/step + arrow-key nudge axis/step. */}
          <TransformHud />

          {/* Left-side floating command palette for action chains (⌘K). Self-gates on the
              chain session, and stays non-modal so the viewport keeps working while open. */}
          <ChainPalette />
        </div>

        {!isPhone && (
          <Sidebar side="right">
            <InspectorContent />
          </Sidebar>
        )}
      </div>

      {!isPhone && <StatusBar />}

      {/* Overlay dialogs — portal to body; mount position is irrelevant. */}

      {/* Modal paint canvas for a mesh's 'painted' glow bitmap. */}
      <GlowPaintDialog />

      {/* Model import (preview + options + warnings). Mounted once for both entry points:
          the Add menu and a drag-drop onto the viewport above. */}
      <ImportModelDialog />
    </div>
  );
}

export default App;
