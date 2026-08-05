import { useEffect } from 'react';
import { ViewportCanvas } from './three/ViewportCanvas';
import { ViewportDropZone } from './ui/ViewportDropZone';
import { MarqueeOverlay } from './ui/MarqueeOverlay';
import { ImportModelDialog } from './ui/ImportModelDialog';
import { ModeSidebar } from './ui/ModeSidebar';
import { ModeFocusEditor } from './ui/ModeFocusEditor';
import { MobileInspector } from './ui/MobileInspector';
import { FloatingPreviewToolbar } from './ui/FloatingPreviewToolbar';
import { ManageTexturesPanel } from './ui/ManageTexturesPanel';
import { GlowPaintDialog } from './ui/GlowPaintDialog';
import { ChainWindow } from './ui/chain/ChainWindow';
import { ToolBarStrip, ToolBarWindow } from './ui/build/ToolBarWindow';
import { GlobalHotkeys } from './ui/hotkeys/GlobalHotkeys';
import { MenuBar } from './ui/shell/MenuBar';
import { PhoneTopBar } from './ui/shell/phone/PhoneTopBar';
import { CondensedStatusBar } from './ui/shell/phone/CondensedStatusBar';
import { PhoneModeTabs } from './ui/shell/phone/PhoneModeTabs';
import { DialogRoot } from './ui/shell/DialogRoot';
import { CommandPalette } from './ui/palette/CommandPalette';
import { Sidebar } from './ui/shell/Sidebar';
import { StatusBar } from './ui/status/StatusBar';
import { useIsPhone } from './ui/kit';
import { toast } from './ui/toast';
import { ensureCatalogLoaded } from './state/catalogStore';
import { ensurePartCatalogLoaded } from './state/partCatalogStore';
import { consumeRemovedProjectsNotice } from './state/projectStore';
import { showAboutOnFirstUse } from './state/aboutStore';
// Side-effect import: registering every command + dynamic provider IS importing this
// module (see src/ui/commands/index.ts). The menubar, the ⌘K palette, the phone MenuSheet
// and the hotkey registry all resolve against what it registers, so it must load once,
// here, before any of them render.
import './ui/commands';
import { initToolStatusWiring } from './ui/status/toolStatusWiring';
import { initAdvisoryWiring } from './ui/status/advisoryWiring';
import { initModifierHintProviders } from './ui/status/modifierHintProviders';
import { setHoverContext } from './state/modifierStore';

// Start feeding the status bar's tool segment from the v1 tool sessions (seat view, measure,
// exhaust placement). Module scope, not an effect: the segment must be truthful from the
// first paint, and the subscription outlives every component. Idempotent.
initToolStatusWiring();

// Raise/lower the status bar's advisory chips (light-preview cap, mods-folder re-grant) and
// register the shipped modifier-hint providers. Same reasoning, same idempotency.
initAdvisoryWiring();
initModifierHintProviders();

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
  // is consumed, so a remount never repeats it. Routed as a `warning`: an 8s amber status
  // flash AND an unread notification-center entry, so the names survive being looked away
  // from (v1 leaned on a 10s toast and lost them — design-system-services §2.5).
  useEffect(() => {
    const removed = consumeRemovedProjectsNotice();
    if (removed.length === 0) return;
    toast({
      title: `Removed ${removed.length} incompatible saved project${removed.length === 1 ? '' : 's'}`,
      description: `${removed.join(', ')} — saved by an older, incompatible version of flexo.`,
      variant: 'warning',
    });
  }, []);

  // First-ever visit: greet the user with the About overlay (dialog id 'about'), then
  // remember it. Lives here rather than in AboutDialog because the dialog is only mounted
  // while open now — nothing would run the check otherwise. Idempotent under StrictMode.
  useEffect(() => {
    showAboutOnFirstUse();
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas text-fg">
      {/* Global keyboard shortcuts (no UI). */}
      <GlobalHotkeys />

      {/* Top row, in flow on both platforms: the slim docked menubar on desktop; on the
          phone the one-row PhoneTopBar whose ☰ opens the MenuSheet — the same MENU_SPEC
          drill-down, so no menu item loses its phone path (foundation §12). */}
      {!isPhone && <MenuBar />}
      {isPhone && <PhoneTopBar />}

      {/* The workspace band (foundation §6.2): everything between the two bars.
          FloatingWindow tenants (later phase) mount inside this element. */}
      <div data-workspace-band className="relative flex min-h-0 flex-1">
        {!isPhone && (
          <Sidebar side="left">
            {/* THE focus editor (foundation §7): tool parameter card → focus card → mode
                cheat-card, as a pure function of (mode, focus). It is the ONE focus slot —
                what structurally ended v1's left-centre triple-booking of the floating
                inspector, the measurement editor and the container editor. */}
            <ModeFocusEditor />
          </Sidebar>
        )}

        {/* The canvas cell. Canvas fills it exactly ⇒ orbit center == visible center.
            Min size per foundation §1.1. */}
        <div
          data-viewport-cell
          className="relative min-h-[180px] min-w-[240px] flex-1"
          // Coarse hover stamping for the status bar's modifier hints (design-system-services
          // §1.4): the hints answer "what would ⇧ do HERE", so the host regions — not the
          // individual entities — report what the pointer is over. `'viewport-entity'` needs a
          // hover raycast the scene does not publish yet; the viewport provider matches both
          // values, so it upgrades for free when the Build-mode phase adds the reporting.
          onPointerEnter={() => setHoverContext('viewport')}
          onPointerLeave={() => setHoverContext('none')}
        >
          {/* The 3D workspace, wrapped so a dropped .glb opens the import dialog. The
              drop zone wraps the CELL only — a drop on a sidebar does nothing. */}
          <ViewportDropZone>
            <ViewportCanvas />
          </ViewportDropZone>

          {/* The box-select rectangle + live count chip. A DOM overlay, so dragging it
              never forces a three.js frame (design-build-mode §1.4). */}
          <MarqueeOverlay />

          {/* ── Legacy floating chrome, re-parented: absolute anchors now resolve
                against the CELL, so everything clamps to the workspace by construction.
                Each surface keeps self-gating exactly as before. ── */}

          {/* On phone the animation scrubber pins to the top-centre of the cell so the clip
              can be scrubbed/replayed without opening the inspector sheet over the 3D view.
              The v1 selection toolbars that used to stack here are gone: the gizmo switcher
              lives in the Tool bar window and the selection actions in the left focus card
              and the Edit menu (foundation §6.3). */}
          {isPhone && (
            <div className="absolute left-1/2 top-2 flex -translate-x-1/2 flex-col items-center gap-2">
              <FloatingPreviewToolbar />
            </div>
          )}

          {/* Phone inspector: a FAB in the cell's corner opening a bottom sheet. The
              desktop inspector is the right sidebar below. */}
          {isPhone && <MobileInspector />}

          {/* Floating, draggable animation preview scrubber over the workspace while the
              Animation editor has a clip open (desktop only — the phone variant pins into
              the top-centre stack above). */}
          {!isPhone && <FloatingPreviewToolbar />}

          {/* Floating per-mesh material editor (glow / visor surface / per-face textures). */}
          <ManageTexturesPanel />
        </div>

        {/* Floating windows mount here, as children of the BAND: their positions are
            band-absolute px and clamp to the workspace, so they must not sit inside the
            viewport cell (foundation §6.1). Exactly two ship (foundation §6.2). Both
            self-gate — the Tool bar on having a gizmo target and on Window ▸ Tool Bar, the
            Chain window on an open session — and both render nothing on phone, where they
            have their own variants below. */}
        <ToolBarWindow />
        <ChainWindow />

        {!isPhone && (
          <Sidebar side="right">
            {/* The right sidebar is flexo's list surface (⇧ range-select, ⌘ toggle), so it
                stamps `'list'` for the modifier hints. `display: contents` on purpose — the
                wrapper must add ZERO layout (the panel inside is `h-full` against the
                sidebar's scroll body), and React synthesizes enter/leave from the FIBER
                tree, so a box-less element still receives them. */}
            <div
              className="contents"
              data-hover-list
              onPointerEnter={() => setHoverContext('list')}
              onPointerLeave={() => setHoverContext('none')}
            >
              <ModeSidebar />
            </div>
          </Sidebar>
        )}
      </div>

      {!isPhone && <StatusBar />}
      {/* The Tool bar's phone variant: a pinned strip in the flex flow directly above the
          condensed strip, rather than a floating window (foundation §12). */}
      {isPhone && <ToolBarStrip />}
      {/* The phone's condensed strip, with the five mode tabs docked below it as the last
          flex child of the frame (foundation §12). Re-tapping the active tab opens that
          mode's Panel sheet — the phone's route to the right-sidebar content. */}
      {isPhone && <CondensedStatusBar />}
      {isPhone && <PhoneModeTabs />}

      {/* Overlay dialogs — portal to body; mount position is irrelevant. */}

      {/* The single root host for every dialogStore-owned dialog (desktop AND phone).
          Renders only the one dialog `$openDialog` names — see DialogRoot's header for
          how to add one. */}
      <DialogRoot />

      {/* ⌘K: fuzzy search over the whole command registry. Desktop and phone alike —
          it is the phone's only way to reach a command with no menu home. */}
      <CommandPalette />

      {/* Modal paint canvas for a mesh's 'painted' glow bitmap. */}
      <GlowPaintDialog />

      {/* Model import (preview + options + warnings). Mounted once for both entry points:
          the Add menu and a drag-drop onto the viewport above. */}
      <ImportModelDialog />
    </div>
  );
}

export default App;
