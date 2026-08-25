/**
 * ICRP app shell, flexo-style (plans/ICRP_PLAN.md P9 + the shell-restructure
 * follow-up): top menu bar, DETAILS on the left, LAYERS/objects/sites on the
 * right, the catalog behind Add \u25b8 Piece / part\u2026 (`A`).
 */
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { cn } from '../../../src/ui/kit';
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
import { $addOpen, $exportOpen } from './state/uiStore';
import { TopBar } from './ui/TopBar';
import { AddDialog } from './ui/AddDialog';
import { ExportDialog } from './ui/ExportDialog';
import { DetailsPanel } from './ui/DetailsPanel';
import { LayersPanel } from './ui/LayersPanel';
import { SitesPanel } from './ui/SitesPanel';
import { ObjectsPanel } from './ui/ObjectsPanel';
import { SceneCanvas } from './three/SceneCanvas';
import { getScene } from './three/sceneHandle';

export function App() {
  const exportOpen = useStore($exportOpen);
  const addOpen = useStore($addOpen);
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
      } else if (e.key === 'F') {
        getScene()?.frameAll();
      } else if (e.key === 'f') {
        getScene()?.frameSelection();
      } else if (e.key === 'g') {
        $groundLock.set(!$groundLock.get());
      } else if (e.key === 'c') {
        $collidersVisible.set(!$collidersVisible.get());
      } else if (e.key === 'a') {
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

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg">
      <TopBar />
      {exportOpen && <ExportDialog onClose={() => $exportOpen.set(false)} />}
      {addOpen && <AddDialog onClose={() => $addOpen.set(false)} />}
      <div className="flex min-h-0 flex-1">
        <DetailsPanel />
        <div className={cn('relative min-w-0 flex-1')}>
          <SceneCanvas />
        </div>
        <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-panel">
          <LayersPanel />
          <ObjectsPanel />
          <SitesPanel />
        </div>
      </div>
    </div>
  );
}
