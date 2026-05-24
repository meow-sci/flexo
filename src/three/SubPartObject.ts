import * as THREE from 'three'
import type { CatalogSubPart } from '../ksa/catalog'
import type { SubPartPlacement } from '../ksa/types'
import { getSubPartGeometry } from './MeshAtlasCache'
import { getSharedMaterial } from './MaterialFactory'
import { applyKsaShaderPatches } from './normalMapPatch'
import { applyPlacement } from './coords'

const HIGHLIGHT = 0x2a4d6e

/**
 * A placed SubPart in the scene: a Group carrying its instance id (for raycast
 * lookup) and a single mesh extracted from the catalog entry's mesh atlas, with
 * the part's PBR material (or a flat fallback when textures are unsupported).
 *
 * The material is a per-instance clone of the shared cached material, so the
 * selection highlight (an emissive override) never bleeds across other instances
 * of the same category. Textures inside the material remain shared by reference.
 */
export class SubPartObject {
  readonly group = new THREE.Group()
  readonly instanceId: string

  private material: THREE.MeshStandardMaterial
  private readonly baseEmissive: THREE.Color
  private readonly baseEmissiveIntensity: number

  private constructor(instanceId: string, mesh: THREE.Mesh, material: THREE.MeshStandardMaterial) {
    this.instanceId = instanceId
    this.material = material
    this.baseEmissive = material.emissive.clone()
    this.baseEmissiveIntensity = material.emissiveIntensity
    this.group.name = `subpart:${instanceId}`
    this.group.userData.instanceId = instanceId
    this.group.add(mesh)
  }

  static async create(
    catalog: CatalogSubPart,
    placement: SubPartPlacement,
  ): Promise<SubPartObject> {
    const [geometry, shared] = await Promise.all([
      getSubPartGeometry(catalog.atlasUrl, catalog.meshNodeName),
      getSharedMaterial(catalog),
    ])
    // Per-instance clone: textures are shared by reference. Material.clone() does
    // NOT copy onBeforeCompile / customProgramCacheKey (verified against three's
    // Material.copy), so re-apply the shader patch on the clone.
    const material = shared.clone()
    applyKsaShaderPatches(material, {
      normal: !!material.normalMap,
      emissive: !!material.emissiveMap,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.instanceId = placement.instanceId
    const obj = new SubPartObject(placement.instanceId, mesh, material)
    obj.setPlacement(placement)
    return obj
  }

  /** Applies a placement transform to the group via the calibrated coords mapping. */
  setPlacement(placement: SubPartPlacement): void {
    applyPlacement(this.group, placement)
  }

  /** Toggles the selection highlight (emissive tint, restored on deselect). */
  setSelected(selected: boolean): void {
    if (selected) {
      this.material.emissive.setHex(HIGHLIGHT)
      this.material.emissiveIntensity = 1
    } else {
      this.material.emissive.copy(this.baseEmissive)
      this.material.emissiveIntensity = this.baseEmissiveIntensity
    }
  }

  dispose(): void {
    // Geometry and textures are shared/cached across instances — do not dispose
    // them here. Only the per-instance cloned material is owned by this object.
    this.material.dispose()
  }
}
