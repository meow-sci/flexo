/**
 * ICRP app shell, flexo-style (plans/ICRP_PLAN.md P9 + the workspace-modes
 * revamp): top menu bar with the mode switcher, and MODE-ADAPTIVE sidebars —
 *
 *   build     LEFT the Library palette (thumbnails, chips, fuzzy search)
 *             RIGHT details + layers-with-piece-outliner + objects
 *   colliders LEFT collider authoring + inspector
 *             RIGHT the collider outliner + objects
 *   sites     LEFT object metres (the pad's ground contract)
 *             RIGHT launch sites + objects
 *
 * On phones (useIsPhone) the sidebars become overlay drawers toggled from the
 * top bar — the viewport keeps the full width.
 */
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { cn } from '../../../src/ui/kit';
import { useIsPhone } from '../../../src/ui/kit/useIsPhone';
import {
  $colliderSelection,
  $selection,
  beginGesture,
  duplicatePlacements,
  endGesture,
  getPlacement,
  redo,
  removeCollider,
  removePlacements,
  selectAllVisible,
  setPlacementTransformsBatch,
  undo,
} from './state/docStore';
import type { Transform } from './ksa/types';
import { ensureStaticCatalogLoaded } from './state/catalogStore';
import { $collidersVisible, $groundLock, $magnet, $snap, setTool } from './state/toolStore';
import { $mode, setMode } from './state/modeStore';
import { $addOpen, $exportOpen, $leftPanelOpen, $rightPanelOpen } from './state/uiStore';
import { TopBar } from './ui/TopBar';
import { LibraryPanel } from './ui/LibraryPanel';
import { AddDialog } from './ui/AddDialog';
import { ExportDialog } from './ui/ExportDialog';
import { DetailsPanel, ObjectInspector } from './ui/DetailsPanel';
import { CollidersPanel } from './ui/CollidersPanel';
import { ColliderOutliner } from './ui/ColliderOutliner';
import { LayersPanel } from './ui/LayersPanel';
import { SitesPanel } from './ui/SitesPanel';
import { ObjectsPanel } from './ui/ObjectsPanel';
import { SceneCanvas } from './three/SceneCanvas';
import { getScene } from './three/sceneHandle';

/** The LEFT sidebar body for the current mode. */
function LeftPanelBody() {
  const mode = useStore($mode);
  if (mode === 'colliders') {
    return (
      <>
        <div className="px-3 pt-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          Colliders
        </div>
        <CollidersPanel />
      </>
    );
  }
  if (mode === 'sites') {
    return (
      <>
        <div className="px-3 pt-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          World
        </div>
        <ObjectInspector />
        <div className="border-t border-border px-3 py-2 text-[11px] text-fg-subtle">
          A launch site pins this object to a latitude/longitude on a body. Add and edit sites in
          the panel on the right; the rings in the viewport show the ground contract (footprint and
          surface height).
        </div>
      </>
    );
  }
  return <LibraryPanel />;
}

/** The RIGHT sidebar body for the current mode. */
function RightPanelBody() {
  const mode = useStore($mode);
  return (
    <>
      {mode === 'build' && <DetailsPanel bare />}
      {mode === 'build' && <LayersPanel />}
      {mode === 'colliders' && <ColliderOutliner />}
      {mode === 'sites' && <SitesPanel />}
      <ObjectsPanel />
    </>
  );
}

export function App() {
  const exportOpen = useStore($exportOpen);
  const addOpen = useStore($addOpen);
  const isPhone = useIsPhone();
  const leftOpen = useStore($leftPanelOpen);
  const rightOpen = useStore($rightPanelOpen);
  const [, setTick] = useState(0);
  useEffect(() => {
    void ensureStaticCatalogLoaded().then(() => setTick((t) => t + 1));
    // Arrow-key nudging streams as ONE undo step per press-and-hold (gesture
    // opens on the first nudge, closes on Arrow keyup).
    let nudging = false;
    const nudgeSelection = (dUp: number, dEast: number, dNorth: number) => {
      const ids = $selection.get();
      if (ids.length === 0) return;
      if (!nudging) {
        beginGesture('Nudge');
        nudging = true;
      }
      const updates = new Map<string, Transform>();
      for (const id of ids) {
        const pl = getPlacement(id);
        if (!pl) continue;
        updates.set(id, {
          ...pl.transform,
          position: {
            x: pl.transform.position.x + dUp,
            y: pl.transform.position.y + dEast,
            z: pl.transform.position.z + dNorth,
          },
        });
      }
      setPlacementTransformsBatch(updates);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (nudging && e.key.startsWith('Arrow')) {
        endGesture();
        nudging = false;
      }
    };
    // Builder-style re-orientation (KSP's WASDQE, shifted off the tool keys):
    // ⇧A/⇧D spin on the ground, ⇧W/⇧S tip over east, ⇧Q/⇧E tip over north —
    // 90° steps, ⌥ for the fine rotate increment.
    const ROTATE_KEYS: Record<string, ['up' | 'east' | 'north', 1 | -1]> = {
      A: ['up', 1],
      D: ['up', -1],
      W: ['east', -1],
      S: ['east', 1],
      Q: ['north', 1],
      E: ['north', -1],
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === 'd') {
        e.preventDefault();
        duplicatePlacements($selection.get());
      } else if (mod && e.key === 'a') {
        e.preventDefault();
        selectAllVisible();
      } else if (mod && e.key === 'e') {
        e.preventDefault();
        $exportOpen.set(true);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const colliderRef = $colliderSelection.get();
        if (colliderRef) removeCollider(colliderRef);
        else removePlacements($selection.get());
      } else if (e.key === '1') {
        setMode('build');
      } else if (e.key === '2') {
        setMode('colliders');
      } else if (e.key === '3') {
        setMode('sites');
      } else if (e.shiftKey && !mod && ROTATE_KEYS[e.key] && $selection.get().length > 0) {
        e.preventDefault();
        const [axis, sign] = ROTATE_KEYS[e.key];
        const deg = e.altKey ? $snap.get().rotateDeg : 90;
        getScene()?.rotateSelection(axis, sign * deg);
      } else if (e.key.startsWith('Arrow') && !mod && $selection.get().length > 0) {
        e.preventDefault();
        const base = $snap.get().enabled ? $snap.get().translateM : 0.1;
        const step = base * (e.shiftKey ? 10 : 1);
        if (e.altKey) {
          if (e.key === 'ArrowUp') nudgeSelection(step, 0, 0);
          else if (e.key === 'ArrowDown') nudgeSelection(-step, 0, 0);
        } else {
          if (e.key === 'ArrowUp') nudgeSelection(0, 0, step);
          else if (e.key === 'ArrowDown') nudgeSelection(0, 0, -step);
          else if (e.key === 'ArrowRight') nudgeSelection(0, step, 0);
          else if (e.key === 'ArrowLeft') nudgeSelection(0, -step, 0);
        }
      } else if (e.key === 'm') {
        $magnet.set(!$magnet.get());
      } else if (e.key === 'F') {
        getScene()?.frameAll();
      } else if (e.key === 'f') {
        getScene()?.frameSelection();
      } else if (e.key === 'g') {
        $groundLock.set(!$groundLock.get());
      } else if (e.key === 'c') {
        $collidersVisible.set(!$collidersVisible.get());
      } else if (e.key === 'a') {
        // preventDefault: the dialog autofocuses its search field, and the same
        // keystroke would otherwise type an 'a' into it.
        e.preventDefault();
        $addOpen.set(true);
      } else if (mod && e.key === 'ArrowDown' && e.shiftKey) {
        e.preventDefault();
        getScene()?.restOnTop($selection.get());
      } else if (mod && e.key === 'ArrowDown') {
        e.preventDefault();
        getScene()?.dropToGround($selection.get());
      } else if (e.key === 'Escape') {
        if (!getScene()?.cancelDrag()) {
          if ($colliderSelection.get()) $colliderSelection.set(null);
          else $selection.set([]);
        }
      } else if (e.key === 'q') {
        setTool('select');
      } else if (e.key === 'w') {
        setTool('translate');
      } else if (e.key === 'e') {
        setTool('rotate');
      } else if (e.key === 'r') {
        setTool('scale');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    // A numeric-field typing session is one streaming gesture (beginGesture on
    // focus, streamed commits per keystroke); leaving the field closes it so the
    // NEXT session gets its own undo step.
    document.addEventListener('focusout', endGesture);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('focusout', endGesture);
    };
  }, []);

  const leftPanel = (
    <div
      className={cn(
        'flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-panel',
        isPhone && 'absolute inset-y-0 left-0 z-20 max-w-[85vw] shadow-xl',
      )}
    >
      <LeftPanelBody />
    </div>
  );
  const rightPanel = (
    <div
      className={cn(
        'flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-panel',
        isPhone && 'absolute inset-y-0 right-0 z-20 max-w-[85vw] shadow-xl',
      )}
    >
      <RightPanelBody />
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg">
      <TopBar />
      {exportOpen && <ExportDialog onClose={() => $exportOpen.set(false)} />}
      {addOpen && <AddDialog onClose={() => $addOpen.set(false)} />}
      <div className="relative flex min-h-0 flex-1">
        {!isPhone && leftPanel}
        <div className={cn('relative min-w-0 flex-1')}>
          <SceneCanvas />
        </div>
        {!isPhone && rightPanel}
        {isPhone && (leftOpen || rightOpen) && (
          <>
            {/* Backdrop: tap closes whichever drawer is open. */}
            <div
              className="absolute inset-0 z-10 bg-black/40"
              aria-hidden
              onClick={() => {
                $leftPanelOpen.set(false);
                $rightPanelOpen.set(false);
              }}
            />
            {leftOpen && leftPanel}
            {rightOpen && rightPanel}
          </>
        )}
      </div>
    </div>
  );
}
