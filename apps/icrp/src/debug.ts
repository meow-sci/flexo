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
      /** Library thumb inputs, NO rendering: [{id, sig, urls}] (generator). */
      thumbInputs: () => { id: string; sig: string; urls: string[] }[];
      /** Forces fresh renders of just these ids; returns how many were queued. */
      thumbRender: (ids: string[]) => number;
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
    thumbInputs: () => {
      const entries = buildLibraryEntries({
        prefabs: $staticObjects.get(),
        parts: $stockParts.get(),
        staticPieces: $staticPieces.get(),
        vesselPieces: $vesselPieces.get(),
      });
      const index = $pieceIndex.get();
      return entries.map((entry) => {
        const previews = previewEntriesFor(entry, index);
        const urls = new Set<string>();
        for (const e of previews) {
          urls.add(e.piece.atlasUrl);
          for (const u of [
            e.piece.diffuseUrl,
            e.piece.normalUrl,
            e.piece.aoRoughMetalUrl,
            e.piece.alphaUrl,
          ]) {
            if (u) urls.add(u);
          }
        }
        return { id: entry.id, sig: catalogThumbSignature(previews), urls: [...urls].sort() };
      });
    },
    thumbRender: (ids: string[]) => {
      const entries = buildLibraryEntries({
        prefabs: $staticObjects.get(),
        parts: $stockParts.get(),
        staticPieces: $staticPieces.get(),
        vesselPieces: $vesselPieces.get(),
      });
      const index = $pieceIndex.get();
      const want = new Set(ids);
      let queued = 0;
      for (const entry of entries) {
        if (!want.has(entry.id)) continue;
        requestCatalogThumb(entry.id, previewEntriesFor(entry, index), true);
        queued++;
      }
      return queued;
    },
    thumbs: () => $catalogThumbs.get(),
  };
}
