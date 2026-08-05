import * as THREE from 'three';
import type { CatalogSubPart } from '../ksa/catalog';
import type { SubPartPlacement } from '../ksa/types';
import { getSubPartGeometry } from './MeshAtlasCache';
import { getSharedMaterial } from './MaterialFactory';
import { applyKsaShaderPatches } from './normalMapPatch';
import { applyPlacement } from './coords';
import { customMeshRenderCache } from '../state/customAssetStore';
import { meshHighlight } from './highlightSettings';
import { applyMaterialOpacity, captureOpacityBase, type MaterialOpacityBase } from './layerOpacity';

/**
 * A placed SubPart in the scene: a Group carrying its instance id (for raycast
 * lookup) and a mesh extracted from the catalog entry's mesh atlas, with the
 * part's PBR material.
 *
 * Custom meshes are served from {@link customMeshRenderCache}, which provides
 * pre-built geometry (with UV transforms baked in) and a per-face material array
 * — bypassing the atlas-GLB round-trip and enabling per-face textures. Core/built-in
 * SubParts continue to use MeshAtlasCache + MaterialFactory.
 *
 * Each instance holds clones of the shared materials so the selection highlight
 * (emissive override) never bleeds across instances. Textures inside the materials
 * remain shared by reference.
 */
export class SubPartObject {
  readonly group = new THREE.Group();
  readonly instanceId: string;

  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly baseEmissives: Array<{ color: THREE.Color; intensity: number }>;
  private readonly opacityBases: MaterialOpacityBase[];

  private constructor(
    instanceId: string,
    mesh: THREE.Mesh,
    materials: THREE.MeshStandardMaterial[],
  ) {
    this.instanceId = instanceId;
    this.materials = materials;
    this.baseEmissives = materials.map((m) => ({
      color: m.emissive.clone(),
      intensity: m.emissiveIntensity,
    }));
    this.opacityBases = materials.map(captureOpacityBase);
    this.group.name = `subpart:${instanceId}`;
    this.group.userData.selectable = { kind: 'subpart', id: instanceId };
    this.group.add(mesh);
  }

  static async create(
    catalog: CatalogSubPart,
    placement: SubPartPlacement,
  ): Promise<SubPartObject> {
    const prebuilt = customMeshRenderCache.get(catalog.id);

    let geometry: THREE.BufferGeometry;
    let materials: THREE.MeshStandardMaterial[];

    if (prebuilt) {
      // Custom mesh: use pre-built geometry + per-face materials from the render cache.
      // Clone each material per-instance so highlight edits don't bleed across instances.
      geometry = prebuilt.geometry;
      materials = prebuilt.materials.map((shared) => {
        const m = shared.clone();
        applyKsaShaderPatches(m, { normal: !!m.normalMap, emissive: !!m.emissiveMap });
        return m;
      });
    } else {
      // Core/built-in SubPart: load geometry from atlas GLB + build shared material.
      const [geo, shared] = await Promise.all([
        getSubPartGeometry(catalog.atlasUrl, catalog.meshNodeName),
        getSharedMaterial(catalog),
      ]);
      geometry = geo;
      const m = shared.clone();
      applyKsaShaderPatches(m, { normal: !!m.normalMap, emissive: !!m.emissiveMap });
      materials = [m];
    }

    const matArg: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] =
      materials.length === 1 ? materials[0] : materials;
    const mesh = new THREE.Mesh(geometry, matArg);
    mesh.userData.selectable = { kind: 'subpart', id: placement.instanceId };
    const obj = new SubPartObject(placement.instanceId, mesh, materials);
    obj.setPlacement(placement);
    return obj;
  }

  /** Applies a placement transform to the group via the calibrated coords mapping. */
  setPlacement(placement: SubPartPlacement): void {
    applyPlacement(this.group, placement);
  }

  /**
   * Toggles the selection highlight (emissive tint, restored on deselect). The
   * color/strength come from the user's mesh-highlight setting. Textured KSA
   * materials read their own emissive from the emissive *map* (added in the shader
   * patch), leaving the standard `emissive` uniform free for this tint — see
   * MaterialFactory + normalMapPatch.
   */
  setSelected(selected: boolean): void {
    this.applyEmissiveTint(selected ? 1 : 0);
  }

  /**
   * The weaker cousin of {@link setSelected}: Data mode tints every placement of the scoped
   * template so the form and the meshes it drives read as one thing (design
   * design-data-engine-modes.md §A2 "placements of the scoped template get a highlight
   * tint"). Same material path, deliberately — a second mechanism would fight the selection
   * for the emissive uniform.
   *
   * `strength` 0 restores the base emissive; the caller (EditorScene) is what guarantees a
   * SELECTED object is never downgraded to a tint.
   */
  setTint(strength: number): void {
    this.applyEmissiveTint(strength);
  }

  private applyEmissiveTint(strength: number): void {
    const hl = meshHighlight();
    for (let i = 0; i < this.materials.length; i++) {
      const mat = this.materials[i];
      if (strength > 0) {
        mat.emissive.copy(hl.color);
        mat.emissiveIntensity = hl.alpha * strength;
      } else {
        mat.emissive.copy(this.baseEmissives[i].color);
        mat.emissiveIntensity = this.baseEmissives[i].intensity;
      }
    }
  }

  /** Dims this instance to `factor` (0–1) of its base opacity for the layer fade. */
  setLayerOpacity(factor: number): void {
    for (let i = 0; i < this.materials.length; i++) {
      applyMaterialOpacity(this.materials[i], this.opacityBases[i], factor);
    }
  }

  dispose(): void {
    // Geometry and textures are shared/cached — do not dispose them here.
    // Only the per-instance cloned materials are owned by this object.
    for (const mat of this.materials) mat.dispose();
  }
}
