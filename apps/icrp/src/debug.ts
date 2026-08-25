/**
 * Dev-only debug handle (`window.__icrp`) so smoke/verification scripts can
 * read the document and drive the scene deterministically. Never in prod
 * builds (the import is guarded in main.tsx by import.meta.env.DEV).
 */
import {
  $colliderSelection,
  $project,
  $selection,
  getPlacement,
  selectLayerContents,
  type ColliderRef,
} from './state/docStore';
import { getScene } from './three/sceneHandle';

declare global {
  interface Window {
    __icrp?: {
      project: () => unknown;
      selection: () => string[];
      placement: (id: string) => unknown;
      selectLayer: (layerId: string) => void;
      pivotScreen: () => { x: number; y: number; visible: boolean } | null;
      hoveredAxis: () => string | null;
      pickAt: (clientX: number, clientY: number) => unknown;
      meshWorld: (id: string) => { x: number; y: number; z: number } | null;
      select: (ids: string[]) => void;
      selectCollider: (ref: ColliderRef | null) => void;
    };
  }
}

export function installDebugHandle(): void {
  window.__icrp = {
    project: () => $project.get(),
    selection: () => $selection.get(),
    placement: (id: string) => getPlacement(id),
    selectLayer: (layerId: string) => selectLayerContents(layerId),
    pivotScreen: () => getScene()?.debugPivotScreen() ?? null,
    hoveredAxis: () => getScene()?.debugHoveredAxis() ?? null,
    pickAt: (clientX: number, clientY: number) => getScene()?.debugPickAt(clientX, clientY),
    meshWorld: (id: string) => getScene()?.debugMeshWorld(id) ?? null,
    select: (ids: string[]) => {
      $colliderSelection.set(null);
      $selection.set(ids);
    },
    selectCollider: (ref: ColliderRef | null) => {
      $selection.set([]);
      $colliderSelection.set(ref);
    },
  };
}
