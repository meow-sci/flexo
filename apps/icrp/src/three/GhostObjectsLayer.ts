/**
 * Inactive objects rendered as non-pickable translucent ghosts (plan D7 —
 * visual aides while editing the active object; flexo's GhostPartsLayer
 * pattern). One shared material; geometry comes from the same atlas cache.
 */
import * as THREE from 'three';
import { applyPlacement } from '../../../../src/three/coords';
import { getSubPartGeometry } from '../../../../src/three/MeshAtlasCache';
import type { CatalogStaticPiece } from '../ksa/staticCatalog';
import type { Placement } from '../ksa/types';

const GHOST_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x8a94a8,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
  metalness: 0,
  roughness: 1,
});

export class GhostObjectsLayer {
  /** Parent under the basis root (placements use raw KSA transforms). */
  readonly group = new THREE.Group();
  private generation = 0;
  private readonly onLoaded: () => void;

  constructor(onLoaded: () => void) {
    this.onLoaded = onLoaded;
    this.group.name = 'ghost-objects';
    // Ghosts are never pickable: SelectionManager walks up from the hit object
    // looking for userData.selectable, and none is set here; raycast is skipped
    // entirely via layers for cheapness.
    this.group.raycast = () => {};
  }

  /** Rebuilds the ghosts for the given inactive objects' placements. */
  update(
    placements: readonly Placement[],
    pieceIndex: ReadonlyMap<string, CatalogStaticPiece>,
  ): void {
    const gen = ++this.generation;
    this.clear();
    for (const pl of placements) {
      const piece = pieceIndex.get(pl.pieceId);
      if (!piece) continue;
      void getSubPartGeometry(piece.atlasUrl, piece.meshNodeName).then((geometry) => {
        if (gen !== this.generation) return; // superseded rebuild
        const mesh = new THREE.Mesh(geometry, GHOST_MATERIAL);
        mesh.raycast = () => {}; // unpickable
        applyPlacement(mesh, pl.transform);
        this.group.add(mesh);
        this.onLoaded();
      });
    }
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      // Geometry is cache-owned, the material shared — nothing per-child to dispose.
      this.group.remove(this.group.children[this.group.children.length - 1]);
    }
  }

  dispose(): void {
    this.generation++;
    this.clear();
    this.group.removeFromParent();
  }
}
