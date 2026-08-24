/**
 * A placed static piece in the scene: a Group carrying its instance id (for
 * raycast lookup) and the atlas mesh with the piece's material
 * (plans/ICRP_PLAN.md P2.02). Modelled on flexo's SubPartObject minus the
 * custom-asset cache; materials are cloned per instance so the selection
 * highlight never bleeds, and the shader patches are re-applied after cloning
 * (`Material.clone()` drops `onBeforeCompile`).
 */
import * as THREE from 'three';
import { applyPlacement } from '../../../../src/three/coords';
import type { CatalogStaticPiece } from '../ksa/staticCatalog';
import type { Placement } from '../ksa/types';
import { getSubPartGeometry } from '../../../../src/three/MeshAtlasCache';
import { getStaticMaterial, reapplyPatches } from './materials';

const SELECT_EMISSIVE = new THREE.Color(0x2cfa1f);
const SELECT_INTENSITY = 0.25;

export class PieceObject {
  readonly group = new THREE.Group();
  readonly instanceId: string;
  /** Template identity guard for the reconcile (a surviving id may swap pieces). */
  readonly pieceId: string;

  private readonly material: THREE.MeshStandardMaterial;
  private readonly baseEmissive: { color: THREE.Color; intensity: number };

  private constructor(
    instanceId: string,
    pieceId: string,
    mesh: THREE.Mesh,
    material: THREE.MeshStandardMaterial,
  ) {
    this.instanceId = instanceId;
    this.pieceId = pieceId;
    this.material = material;
    this.baseEmissive = { color: material.emissive.clone(), intensity: material.emissiveIntensity };
    this.group.name = `piece:${instanceId}`;
    // 'subpart' is flexo's SelectionManager vocabulary; ICRP has one pickable
    // kind, and reusing the manager beats copying it for a rename.
    this.group.userData.selectable = { kind: 'subpart', id: instanceId };
    this.group.add(mesh);
  }

  static async create(piece: CatalogStaticPiece, placement: Placement): Promise<PieceObject> {
    const [geometry, shared] = await Promise.all([
      getSubPartGeometry(piece.atlasUrl, piece.meshNodeName),
      getStaticMaterial(piece),
    ]);
    const material = shared.clone();
    reapplyPatches(material);
    const mesh = new THREE.Mesh(geometry, material);
    // Blended pieces draw after opaque and do not write depth (F7).
    if (material.transparent) mesh.renderOrder = 1;
    const obj = new PieceObject(placement.instanceId, placement.pieceId, mesh, material);
    obj.applyTransform(placement);
    return obj;
  }

  /** Applies the placement's KSA-frame transform (parent = the basis root). */
  applyTransform(placement: Placement): void {
    applyPlacement(this.group, placement.transform);
  }

  setSelected(selected: boolean): void {
    if (selected) {
      this.material.emissive.copy(SELECT_EMISSIVE);
      this.material.emissiveIntensity = SELECT_INTENSITY;
    } else {
      this.material.emissive.copy(this.baseEmissive.color);
      this.material.emissiveIntensity = this.baseEmissive.intensity;
    }
  }

  dispose(): void {
    // Geometry and textures are cache-owned (app lifetime); only the per-instance
    // material clone is ours.
    this.material.dispose();
    this.group.removeFromParent();
  }
}
