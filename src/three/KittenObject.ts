import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { KittenInstance, KittenKind } from '../ksa/types'
import {
  HIDDEN_BODY_MATERIALS,
  KITTEN_ATTACHMENTS,
  KITTEN_BODY_GLTF_URL,
  kittenBodyMaterials,
  type KittenMaterialSpec,
} from '../ksa/kittenAssets'
import { applyPlacement } from './coords'
import { kittenHighlight } from './highlightSettings'
import {
  ATTACHMENT_CORRECTION,
  bakeGeometry,
  buildKittenMaterial,
  collectMeshes,
  loadKittenGltf,
  materialName,
} from './kittenBake'

/**
 * Bakes a mesh's CURRENT posed geometry into a fresh static mesh (see
 * {@link bakeGeometry}), tagged as a selectable kitten instance for raycast lookup.
 */
function bakeMesh(mesh: THREE.Mesh, material: THREE.Material, id: string): THREE.Mesh {
  const baked = new THREE.Mesh(bakeGeometry(mesh), material)
  baked.userData.selectable = { kind: 'kitten', id }
  return baked
}

/**
 * A kitten EVA character in the scene: a STATIC bind-pose body (suit + per-kitten
 * head/eyes) with helmet, visor and MMU backpack placed at the bind-pose socket-bone
 * transforms. Purely a visual aide — see {@link KittenInstance}. Models on SubPartObject:
 * a Group carrying the instance id for raycast lookup, with per-instance materials so
 * the selection highlight never bleeds across instances.
 */
export class KittenObject {
  readonly group = new THREE.Group()
  readonly id: string

  /** Every per-instance material we own (for highlight + disposal). */
  private readonly materials: THREE.MeshStandardMaterial[]
  private readonly baseEmissive: { mat: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[]

  private constructor(id: string, materials: THREE.MeshStandardMaterial[]) {
    this.id = id
    this.materials = materials
    this.baseEmissive = materials.map((mat) => ({
      mat,
      color: mat.emissive.clone(),
      intensity: mat.emissiveIntensity,
    }))
    this.group.name = `kitten:${id}`
    this.group.userData.selectable = { kind: 'kitten', id }
  }

  static async create(kind: KittenKind, instance: KittenInstance): Promise<KittenObject> {
    const bodyGltf = await loadKittenGltf(KITTEN_BODY_GLTF_URL)
    const body = cloneSkeleton(bodyGltf.scene)
    body.updateMatrixWorld(true) // pose the bind-pose skeleton before baking
    const owned: THREE.MeshStandardMaterial[] = []
    const bodyOverrides = kittenBodyMaterials(kind)
    // Everything is baked into this group in the body root's space, then placed.
    const baked = new THREE.Group()

    // Body: bake each (skinned) mesh to a static mesh with its KSA material.
    for (const mesh of collectMeshes(body)) {
      if (HIDDEN_BODY_MATERIALS.has(materialName(mesh.material) ?? '')) continue // clear cornea
      const mat = await resolveMaterial(mesh, bodyOverrides, owned)
      baked.add(bakeMesh(mesh, mat, instance.id))
    }

    // Attachments: bake each at its socket bone's bind-pose world transform. The
    // attachment is authored in cm model space with its origin at the socket; the
    // bone's world matrix carries the head/chest position and the body root's
    // Z-up→Y-up + 0.01-scale conversion, and ATTACHMENT_CORRECTION orients it.
    for (const att of KITTEN_ATTACHMENTS) {
      const bone = body.getObjectByName(att.socketBone)
      if (!bone) {
        console.warn(`KittenObject: socket bone '${att.socketBone}' not found for ${att.name}`)
        continue
      }
      const node = cloneSkeleton((await loadKittenGltf(att.gltfUrl)).scene)
      node.updateMatrixWorld(true)
      const M = bone.matrixWorld.clone().multiply(ATTACHMENT_CORRECTION)
      for (const mesh of collectMeshes(node)) {
        const mat = await resolveMaterial(mesh, att.materials, owned)
        const m = bakeMesh(mesh, mat, instance.id) // baked in attachment-local space
        m.applyMatrix4(M) // place + orient at the socket (body-root space)
        baked.add(m)
      }
    }

    const obj = new KittenObject(instance.id, owned)
    obj.group.add(baked)
    obj.setInstance(instance)
    return obj
  }

  /** Applies the instance transform to the group via the calibrated coords mapping. */
  setInstance(instance: KittenInstance): void {
    applyPlacement(this.group, instance)
  }

  /** Toggles the selection highlight (emissive tint across all owned materials). */
  setSelected(selected: boolean): void {
    if (selected) {
      const hl = kittenHighlight()
      for (const mat of this.materials) {
        mat.emissive.copy(hl.color)
        mat.emissiveIntensity = hl.alpha
      }
    } else {
      for (const { mat, color, intensity } of this.baseEmissive) {
        mat.emissive.copy(color)
        mat.emissiveIntensity = intensity
      }
    }
  }

  dispose(): void {
    // Geometry and textures are shared/cached; only the per-instance materials
    // (and the embedded clones) are owned here.
    for (const mat of this.materials) mat.dispose()
  }
}

/**
 * Resolves the per-instance KSA material for a gltf mesh by its gltf material name.
 * Unmatched meshes get a neutral grey material — the embedded material only points
 * at the missing DefaultORM.png (redirected to an ORM that reads yellow as base
 * color), so it is never kept. Pushes built materials onto `owned`.
 */
async function resolveMaterial(
  mesh: THREE.Mesh,
  overrides: Record<string, KittenMaterialSpec>,
  owned: THREE.MeshStandardMaterial[],
): Promise<THREE.MeshStandardMaterial> {
  const name = materialName(mesh.material)
  const spec = name ? overrides[name] : undefined
  const mat = spec
    ? await buildKittenMaterial(spec)
    : new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0, roughness: 0.85 })
  // Render two-sided: the KSA body mesh mirrors limbs (one glove's winding is
  // reversed relative to its authored normals), which back-face culls to black
  // under FrontSide. DoubleSide flips the normal for back faces so both sides light
  // correctly — the right fix for these imported meshes, and free for a static aide.
  mat.side = THREE.DoubleSide
  owned.push(mat)
  return mat
}
