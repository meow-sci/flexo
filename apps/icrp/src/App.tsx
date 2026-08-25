/**
 * ICRP app shell, flexo-style (plans/ICRP_PLAN.md P9 + the workspace-modes
 * revamp): top menu bar with the mode switcher, and MODE-ADAPTIVE sidebars —
 *
 *   build     LEFT details (selection transform, align, arrays, object metres)
 *             RIGHT layers-with-piece-outliner + objects
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
  duplicatePlacements,
  endGesture,
  redo,
  removeCollider,
  removePlacements,
  selectAllVisible,
  undo,
} from './state/docStore';
import { ensureStaticCatalogLoaded } from './state/catalogStore';
import { $collidersVisible, $groundLock, setTool } from './state/toolStore';
import { $mode, setMode } from './state/modeStore';
import { $addOpen, $exportOpen, $leftPanelOpen, $rightPanelOpen } from './state/uiStore';
import { TopBar } from './ui/TopBar';
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
  return <DetailsPanel bare />;
}

/** The RIGHT sidebar body for the current mode. */
function RightPanelBody() {
  const mode = useStore($mode);
  return (
    <>
      {mode === 'build' && <LayersPanel />}
      {mode === 'colliders' && <ColliderOutliner />}
      {mode === 'sites' && <SitesPanel />}
      <ObjectsPanel />
      {mode === 'build' && <SitesPanel />}
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
    // A numeric-field typing session is one streaming gesture (beginGesture on
    // focus, streamed commits per keystroke); leaving the field closes it so the
    // NEXT session gets its own undo step.
    document.addEventListener('focusout', endGesture);
    return () => {
      window.removeEventListener('keydown', onKey);
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
