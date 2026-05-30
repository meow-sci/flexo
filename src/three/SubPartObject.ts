import * as THREE from 'three'
import type { CatalogSubPart } from '../ksa/catalog'
import type { SubPartPlacement } from '../ksa/types'
import { getSubPartGeometry } from './MeshAtlasCache'
import { getSharedMaterial } from './MaterialFactory'
import { applyKsaShaderPatches } from './normalMapPatch'
import { applyPlacement } from './coords'
import { customMeshRenderCache } from '../state/customAssetStore'

const HIGHLIGHT = 0x2a4d6e

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
  readonly group = new THREE.Group()
  readonly instanceId: string

  private readonly materials: THREE.MeshStandardMaterial[]
  private readonly baseEmissives: Array<{ color: THREE.Color; intensity: number }>

  private constructor(instanceId: string, mesh: THREE.Mesh, materials: THREE.MeshStandardMaterial[]) {
    this.instanceId = instanceId
    this.materials = materials
    this.baseEmissives = materials.map((m) => ({
      color: m.emissive.clone(),
      intensity: m.emissiveIntensity,
    }))
    this.group.name = `subpart:${instanceId}`
    this.group.userData.selectable = { kind: 'subpart', id: instanceId }
    this.group.add(mesh)
  }

  static async create(
    catalog: CatalogSubPart,
    placement: SubPartPlacement,
  ): Promise<SubPartObject> {
    const prebuilt = customMeshRenderCache.get(catalog.id)

    let geometry: THREE.BufferGeometry
    let materials: THREE.MeshStandardMaterial[]

    if (prebuilt) {
      // Custom mesh: use pre-built geometry + per-face materials from the render cache.
      // Clone each material per-instance so highlight edits don't bleed across instances.
      geometry = prebuilt.geometry
      materials = prebuilt.materials.map((shared) => {
        const m = shared.clone()
        applyKsaShaderPatches(m, { normal: !!m.normalMap, emissive: !!m.emissiveMap })
        return m
      })
    } else {
      // Core/built-in SubPart: load geometry from atlas GLB + build shared material.
      const [geo, shared] = await Promise.all([
        getSubPartGeometry(catalog.atlasUrl, catalog.meshNodeName),
        getSharedMaterial(catalog),
      ])
      geometry = geo
      const m = shared.clone()
      applyKsaShaderPatches(m, { normal: !!m.normalMap, emissive: !!m.emissiveMap })
      materials = [m]
    }

    const matArg: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] =
      materials.length === 1 ? materials[0] : materials
    const mesh = new THREE.Mesh(geometry, matArg)
    mesh.userData.selectable = { kind: 'subpart', id: placement.instanceId }
    const obj = new SubPartObject(placement.instanceId, mesh, materials)
    obj.setPlacement(placement)
    return obj
  }

  /** Applies a placement transform to the group via the calibrated coords mapping. */
  setPlacement(placement: SubPartPlacement): void {
    applyPlacement(this.group, placement)
  }

  /** Toggles the selection highlight (emissive tint, restored on deselect). */
  setSelected(selected: boolean): void {
    for (let i = 0; i < this.materials.length; i++) {
      const mat = this.materials[i]
      if (selected) {
        mat.emissive.setHex(HIGHLIGHT)
        mat.emissiveIntensity = 1
      } else {
        mat.emissive.copy(this.baseEmissives[i].color)
        mat.emissiveIntensity = this.baseEmissives[i].intensity
      }
    }
  }

  dispose(): void {
    // Geometry and textures are shared/cached — do not dispose them here.
    // Only the per-instance cloned materials are owned by this object.
    for (const mat of this.materials) mat.dispose()
  }
}
