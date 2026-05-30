import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { KittenInstance, KittenKind } from '../ksa/types'
import {
  HIDDEN_BODY_MATERIALS,
  KITTEN_ATTACHMENTS,
  KITTEN_BODY_GLTF_URL,
  kittenBodyMaterials,
  type KittenMaterialSpec,
} from '../ksa/kittenAssets'
import { toUrl } from '../ksa/catalog'
import { isTextureSupported } from './textureSupport'
import { loadTexture } from './TextureCache'
import { makeFlatMaterial } from './MaterialFactory'
import { applyKsaShaderPatches } from './normalMapPatch'
import { applyPlacement } from './coords'
import { withProgress } from './trackedLoad'

const HIGHLIGHT = 0x2a4d6e

/**
 * The kitten gltfs reference an embedded "DefaultORM.png" that does not ship with
 * the decompiled assets (and the dev server's SPA fallback would serve index.html
 * for it, breaking the image decode). Redirect any such request to the real, served
 * EmptyAoRoughMetallic.png (a valid neutral ORM) so GLTFLoader's parse never errors —
 * the meshes that actually matter get their real KSA textures via {@link buildKittenMaterial}.
 */
const PLACEHOLDER_ORM_URL = toUrl('Textures/Characters/EmptyAoRoughMetallic.png')

function makeKittenManager(): THREE.LoadingManager {
  const m = new THREE.LoadingManager()
  m.setURLModifier((url) => (url.endsWith('DefaultORM.png') ? PLACEHOLDER_ORM_URL : url))
  return m
}

const gltfLoader = new GLTFLoader(makeKittenManager())
const gltfCache = new Map<string, Promise<GLTF>>()

function loadGltf(url: string): Promise<GLTF> {
  let pending = gltfCache.get(url)
  if (!pending) {
    pending = withProgress(url, (onProgress) => gltfLoader.loadAsync(url, onProgress))
    gltfCache.set(url, pending)
  }
  return pending
}

/**
 * Builds a per-instance PBR material from a KSA texture spec (mirrors
 * MaterialFactory's vessel shader). When the spec has no ORM map (eyes/head/labels —
 * KSA uses a constant empty ORM there), the surface is plainly non-metallic.
 * Per-instance (not cached) so the selection-highlight emissive never bleeds.
 */
async function buildKittenMaterial(spec: KittenMaterialSpec): Promise<THREE.MeshStandardMaterial> {
  // Flat-color spec (e.g. eye whites): no textures to load.
  if (!spec.diffuseUrl) {
    return new THREE.MeshStandardMaterial({
      color: spec.color ?? 0xffffff,
      metalness: 0,
      roughness: 0.85,
    })
  }
  if (!isTextureSupported()) return makeFlatMaterial()
  const [map, orm, normal] = await Promise.all([
    loadTexture(spec.diffuseUrl, 'srgb'),
    spec.aoRoughMetalUrl ? loadTexture(spec.aoRoughMetalUrl, 'linear') : null,
    spec.normalUrl ? loadTexture(spec.normalUrl, 'linear') : null,
  ])
  const mat = new THREE.MeshStandardMaterial({ map })
  if (orm) {
    mat.aoMap = orm
    mat.roughnessMap = orm
    mat.metalnessMap = orm
    mat.aoMap.channel = 0 // KSA uses TEXCOORD_0 for all maps
    mat.metalness = 1 // read straight from the map
    mat.roughness = 1
  } else {
    mat.metalness = 0
    mat.roughness = 0.85
  }
  if (normal) {
    mat.normalMap = normal
    mat.normalMapType = THREE.TangentSpaceNormalMap
    mat.normalScale.set(1, 1)
  }
  if (spec.transparent) {
    mat.transparent = true
    mat.opacity = 0.45
    mat.depthWrite = false
  }
  applyKsaShaderPatches(mat, { normal: !!normal, emissive: false })
  return mat
}

const D = Math.PI / 180

/**
 * Local-space orientation correction applied to each attachment before its socket
 * bone's world matrix (post-multiplied: `bone · ATTACHMENT_CORRECTION`). This is
 * KSA's `RotZ(-90)·RotX(-90)` socket correction, reordered to `RotX(-90)·RotZ(-90)`
 * for the glTF-imported, column-major three.js frame (calibrated against the head:
 * it centers the helmet/visor on the head with the visor facing forward, and seats
 * the MMU on the back). Without it, the cm-space attachments land beside/below the
 * socket. If the helmet/backpack ever look mis-oriented, this is the knob.
 */
const ATTACHMENT_CORRECTION = new THREE.Matrix4()
  .makeRotationX(-90 * D)
  .multiply(new THREE.Matrix4().makeRotationZ(-90 * D))

/**
 * Bakes a mesh's CURRENT posed geometry into a fresh static mesh, in the world
 * space of `body` (the gltf scene root, kept at identity during baking). For a
 * SkinnedMesh this evaluates the bind pose on the CPU via {@link THREE.SkinnedMesh.getVertexPosition}
 * so the result needs NO runtime GPU skinning — the kitten is a no-animation visual
 * aide, and baking makes it render identically on every GPU (a 242-bone skeleton
 * that fails to skin would otherwise collapse every mesh to the origin).
 *
 * The gltf's AUTHORED (smooth) normals are preserved and transformed by the mesh's
 * normal matrix — NOT recomputed. Recomputing from baked positions yields faceted
 * shading because the meshes are vertex-split at UV/normal seams. In the default
 * (bind) pose, CPU skinning is identity (verified: baked positions equal the authored
 * gltf positions), so the world normal is simply `normalMatrix(matrixWorld)·normal`.
 * UVs/index are carried over so the KSA (derivative-tangent) normal maps still work.
 */
function bakeMesh(mesh: THREE.Mesh, material: THREE.Material, id: string): THREE.Mesh {
  const src = mesh.geometry
  const posAttr = src.attributes.position as THREE.BufferAttribute
  const normAttr = src.attributes.normal as THREE.BufferAttribute | undefined
  const n = posAttr.count
  const pos = new Float32Array(n * 3)
  const nrm = normAttr ? new Float32Array(n * 3) : null
  const v = new THREE.Vector3()
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
  const skinned =
    (mesh as THREE.SkinnedMesh).isSkinnedMesh &&
    typeof (mesh as THREE.SkinnedMesh).getVertexPosition === 'function'
  if (skinned) (mesh as THREE.SkinnedMesh).skeleton.update()
  for (let i = 0; i < n; i++) {
    if (skinned) (mesh as THREE.SkinnedMesh).getVertexPosition(i, v)
    else v.fromBufferAttribute(posAttr, i)
    v.applyMatrix4(mesh.matrixWorld) // → body-root space
    pos[i * 3] = v.x
    pos[i * 3 + 1] = v.y
    pos[i * 3 + 2] = v.z
    if (nrm && normAttr) {
      v.fromBufferAttribute(normAttr, i).applyMatrix3(nm).normalize()
      nrm[i * 3] = v.x
      nrm[i * 3 + 1] = v.y
      nrm[i * 3 + 2] = v.z
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  if (src.attributes.uv) geo.setAttribute('uv', (src.attributes.uv as THREE.BufferAttribute).clone())
  if (src.index) geo.setIndex(src.index.clone())
  if (nrm) geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  else geo.computeVertexNormals() // fallback for meshes with no authored normals
  const baked = new THREE.Mesh(geo, material)
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
    const bodyGltf = await loadGltf(KITTEN_BODY_GLTF_URL)
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
      const node = cloneSkeleton((await loadGltf(att.gltfUrl)).scene)
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
      for (const mat of this.materials) {
        mat.emissive.setHex(HIGHLIGHT)
        mat.emissiveIntensity = 1
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

/** All meshes under `root`, in traversal order. */
function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  return meshes
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

function materialName(material: THREE.Material | THREE.Material[]): string | null {
  if (Array.isArray(material)) return material[0]?.name ?? null
  return material?.name ?? null
}
