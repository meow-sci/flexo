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
  setPlacementTransform,
  updateCollider,
  type ColliderRef,
} from './state/docStore';
import type { PartCollider, Transform } from './ksa/types';
import { getScene } from './three/sceneHandle';
import {
  $pieceIndex,
  $staticObjects,
  $staticPieces,
  $stockParts,
  $vesselPieces,
} from './state/catalogStore';
import { buildLibraryEntries, previewEntriesFor } from './state/libraryEntries';
import { $catalogThumbs, catalogThumbSignature, requestCatalogThumb } from './three/catalogThumbs';

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
      /** Out-of-band store writes (the gizmo's path) — stale-render regression tests. */
      updateCollider: (ref: ColliderRef, patch: Partial<PartCollider>) => void;
      setPlacementTransform: (id: string, t: Transform) => void;
      /** What the last body-drag move snapped with ('connector' | 'box' | null). */
      lastSnapKind: () => string | null;
      /** Forces fresh renders of EVERY library thumb; returns [{id, sig}] (generator). */
      thumbAll: () => { id: string; sig: string }[];
      /** Current thumb map (id → data/static URL). */
      thumbs: () => Record<string, string>;
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
    updateCollider: (ref: ColliderRef, patch: Partial<PartCollider>) => updateCollider(ref, patch),
    setPlacementTransform: (id: string, t: Transform) => setPlacementTransform(id, t),
    lastSnapKind: () => getScene()?.debugLastSnapKind() ?? null,
    thumbAll: () => {
      const entries = buildLibraryEntries({
        prefabs: $staticObjects.get(),
        parts: $stockParts.get(),
        staticPieces: $staticPieces.get(),
        vesselPieces: $vesselPieces.get(),
      });
      const index = $pieceIndex.get();
      return entries.map((entry) => {
        const previews = previewEntriesFor(entry, index);
        requestCatalogThumb(entry.id, previews, true);
        return { id: entry.id, sig: catalogThumbSignature(previews) };
      });
    },
    thumbs: () => $catalogThumbs.get(),
  };
}
