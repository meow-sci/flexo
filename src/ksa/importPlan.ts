import * as THREE from 'three'
import type { GltfTextureRef, LoadedModel, ModelSource } from '../three/loadModelFile'
import { bakeGeometry } from '../three/kittenBake'

/**
 * ANALYSIS pass of the model importer: a loaded glTF scene → an {@link ImportPlan} that says
 * exactly which SubParts flexo would create, where each one would be placed, and everything
 * about the file that KSA cannot represent. Pure and non-mutating — the dialog shows a plan,
 * the user tweaks {@link ImportOptions}, and only {@link normalizeImport} (importNormalize.ts)
 * turns it into geometry + descriptors. Nothing here touches the editor document.
 *
 * THE GRANULARITY RULE (this IS the "align to the KSA paradigm" part of the feature):
 *
 *   one (glTF mesh × material) pair  →  one SubPart
 *   every node referencing it        →  one placement
 *
 * because a KSA `<PartModel>` is exactly one `<Mesh>` + one `<Material>`
 * (decomp/KSA/PartModelModule.cs:17-35) and the part render path draws only
 * `DeviceMeshesInterleaved[0]` — glTF **primitive 0** — with a single bound material
 * (decomp/KSA/MeshReference.cs:58,76-118; decomp/KSA/PartModel.cs:400-418). A multi-material
 * object therefore MUST split, and the split is a game limit, not a preference.
 *
 * Node transforms cannot ride along either: KSA's atlas loader iterates `GltfJson.Meshes[]`
 * and never looks at the node graph (decomp/KSA/MeshAtlasFileReference.cs:22-49), so a node's
 * world matrix has to become a flexo *placement* (or be baked into the geometry) — which is
 * what {@link ImportInstance} carries.
 */

// ── options ──────────────────────────────────────────────────────────────────

/** User-tweakable knobs from the import dialog. Passed to BOTH analyze and normalize. */
export interface ImportOptions {
  /** Uniform scale applied to the whole import (1 = the file's units are already metres). */
  scale: number
  /**
   * Which axis the file calls "up". glTF, three.js and KSA all agree on right-handed Y-up
   * metres (see `src/three/coords.ts`), so a default Blender export needs NO conversion;
   * 'z' applies the `RotX(-90°)` correction for files exported without it.
   */
  upAxis: 'y' | 'z'
  /** Bake node world transforms into the geometry and place everything at the origin. */
  bakeTransforms: boolean
  /**
   * Bake the instance's scale into the geometry, leaving rotation + translation on the
   * placement. Default: predictable texel density and gizmo behaviour beat a faithful
   * scale value in the inspector. (A mirrored transform is baked regardless — see
   * importNormalize.)
   */
  bakeScale: boolean
  /** Duplicate + flip the geometry so the surface is visible from behind (KSA culls back faces). */
  doubleSided: boolean
  /** Prefixed onto every created SubPart's display name. */
  namePrefix: string
  /**
   * Collapse every group + instance into ONE SubPart with one placement (one draw, one
   * `<PartModel>`). Honoured by {@link normalizeImport} only when the whole model uses a
   * SINGLE material — a merge across materials would violate the one-material-per-SubPart
   * game limit, so the dialog offers the switch only then (see {@link canMerge}).
   */
  merge: boolean
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  scale: 1,
  upAxis: 'y',
  bakeTransforms: false,
  bakeScale: true,
  doubleSided: false,
  namePrefix: '',
  merge: false,
}

// ── plan shape ───────────────────────────────────────────────────────────────

/** One node referencing a group's geometry — becomes one flexo placement. */
export interface ImportInstance {
  /** The glTF node/object name, for provenance and warning subjects. */
  nodeName: string
  /**
   * World matrix relative to the SCENE ROOT, pre-multiplied by the import correction
   * (uniform {@link ImportOptions.scale} and the Z-up→Y-up rotation). Metres, KSA basis.
   */
  matrix: THREE.Matrix4
}

/** One (mesh × material) pair — one future SubPart, with every node that references it. */
export interface ImportGroup {
  /** Stable within one import (geometry+material identity); NOT stable across re-imports. */
  key: string
  /** "Hull", or "Hull · PaintedMetal" when that node split across several materials. */
  suggestedName: string
  sourceNode: string
  sourceMaterial: string
  /** The three material. Phase 2 reads its maps/factors; keep the reference alive. */
  material: THREE.Material
  /**
   * `materials[i]` index in the glTF JSON (from `parser.associations`), or null for the
   * glTF default material / a scene not loaded from a file. This — not the three material —
   * is the material identity the translation pass keys on: it is what dedupes two groups
   * onto one flexo `CustomMaterial`, and what resolves the FACTORS three folded away
   * (see src/ksa/importMaterials.ts).
   */
  materialIndex: number | null
  /** SOURCE geometry, untouched, in node-local space. Owned by the loaded scene — do not dispose. */
  geometry: THREE.BufferGeometry
  /**
   * Set only for skinned meshes: the bind pose CPU-baked to scene-root space (KSA parts have
   * no GPU skinning — meshes load with `VertexImportFlags.Normals | UVs`, no JOINTS/WEIGHTS,
   * decomp/KSA/MeshReference.cs:83). When present, normalization uses THIS instead of
   * {@link geometry} and the single instance is the import correction alone.
   */
  skinnedRootBake?: THREE.BufferGeometry
  triangles: number
  vertices: number
  instances: ImportInstance[]
}

/**
 * Warning kinds. OPEN FOR EXTENSION — the material/texture pass adds `imageDecode`
 * (see importMaterials.ts) and Phase 4 will add texture-budget codes.
 */
export type ImportWarningCode =
  | 'multiMaterial'
  | 'doubleSided'
  | 'alphaMask'
  | 'alphaBlend'
  | 'noUv'
  | 'noNormals'
  | 'uv1'
  | 'vertexColors'
  | 'morphTargets'
  | 'skinned'
  | 'animations'
  | 'mirrored'
  | 'heavyMesh'
  | 'noMeshes'
  /** A glTF material extension with no KSA equivalent (clearcoat, transmission, …). */
  | 'materialExtension'
  /** A KHR_texture_basisu source image — already block-compressed, so not re-encodable. */
  | 'basisuImage'
  /** A sampler wrap mode other than Repeat (KSA's sampler is hard-wired Repeat). */
  | 'samplerWrap'
  /** A KHR_texture_transform on a texture reference (KSA has no UV transform). */
  | 'textureTransform'
  /** A material channel sampling TEXCOORD_1 (KSA reads UV0 for all five slots). */
  | 'textureUv1'
  /** A source image flexo could not decode to pixels (so its factors can't be baked in). */
  | 'imageDecode'
  /** "Merge into one SubPart" was asked for but the pieces couldn't be combined. */
  | 'mergeFailed'

/** One thing about the file that KSA can't represent, in the user's language. */
export interface ImportWarning {
  code: ImportWarningCode
  /** What it is about — an object, material or file name. Also the dedup key with `code`. */
  subject: string
  /** Plain English: what happens. */
  message: string
  /** Plain English: what to do about it. Absent when the importer already handled it. */
  remedy?: string
}

export interface ImportPlan {
  fileName: string
  groups: ImportGroup[]
  warnings: ImportWarning[]
  totals: {
    subParts: number
    placements: number
    /** UNIQUE geometry totals (what the atlas GLB holds) — a mesh instanced N times counts once. */
    triangles: number
    vertices: number
    materials: number
  }
  /** Metres, post scale/up-axis correction, over every instance. Zeroed when there are no meshes. */
  bounds: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3 }
}

/**
 * Whether "merge into one SubPart" may be offered: a KSA `<PartModel>` binds exactly ONE
 * material (decomp/KSA/PartModel.cs:400-418), so merging across materials is illegal, not
 * merely undesirable. A model that is already one SubPart with one placement has nothing to
 * merge, so the switch stays hidden there too.
 */
export function canMerge(plan: ImportPlan): boolean {
  return plan.totals.materials === 1 && (plan.totals.subParts > 1 || plan.totals.placements > 1)
}

/**
 * The totals the user will actually get, i.e. {@link ImportPlan.totals} after an effective
 * merge collapses every group + instance into one SubPart with one placement. Split out of
 * the dialog so the "what am I about to create" numbers are testable on their own.
 */
export function plannedTotals(plan: ImportPlan, merge: boolean): ImportPlan['totals'] {
  if (!merge || !canMerge(plan)) return plan.totals
  // Merging BAKES every instance, so instanced geometry is duplicated in the merged mesh —
  // the triangle/vertex counts grow to the drawn totals rather than the unique ones.
  return {
    subParts: 1,
    placements: 1,
    triangles: plan.groups.reduce((n, g) => n + g.triangles * g.instances.length, 0),
    vertices: plan.groups.reduce((n, g) => n + g.vertices * g.instances.length, 0),
    materials: plan.totals.materials,
  }
}

// ── analysis ─────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180
const IDENTITY = new THREE.Matrix4()

/** Triangles that make one SubPart's CPU picking loop (RayCastEgoSubPart) worth warning about. */
const HEAVY_MESH_TRIANGLES = 100_000
/** Whole-import triangle budget (plan §3.7). */
const HEAVY_IMPORT_TRIANGLES = 500_000

/**
 * The import correction: uniform scale, plus `RotX(-90°)` when the file is Z-up. Uniform scale
 * commutes with rotation, so the compose order is irrelevant; it is applied to every instance
 * matrix (and to the skinned bake) so bounds, placements and geometry all agree.
 */
function correctionMatrix(opts: ImportOptions): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeScale(opts.scale, opts.scale, opts.scale)
  if (opts.upAxis === 'z') m.premultiply(new THREE.Matrix4().makeRotationX(-90 * DEG))
  return m
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex()
  if (index) return Math.floor(index.count / 3)
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3)
}

function vertexCount(geometry: THREE.BufferGeometry): number {
  return geometry.getAttribute('position')?.count ?? 0
}

/**
 * Extracts the sub-geometry a single material index covers, as a standalone indexed geometry.
 * DEFENSIVE: three's GLTFLoader already splits a multi-primitive glTF mesh into one `Mesh` per
 * primitive, so a `Mesh` with an ARRAY material never arrives from a glTF file — but a
 * hand-built scene (or a future loader change) could produce one, and silently merging two
 * materials into a single group would violate the one-material-per-SubPart game limit.
 */
function subGeometryForMaterial(
  geometry: THREE.BufferGeometry,
  materialIndex: number,
): THREE.BufferGeometry {
  const index = geometry.getIndex()
  const total = index ? index.count : vertexCount(geometry)
  const ranges = geometry.groups.filter((g) => g.materialIndex === materialIndex)
  const picked: number[] = []
  for (const range of ranges) {
    const end = Math.min(range.start + range.count, total)
    for (let i = range.start; i < end; i++) picked.push(index ? index.getX(i) : i)
  }
  const out = geometry.clone()
  out.clearGroups()
  out.setIndex(picked)
  return out
}

/** All meshes under a root, in traversal order (SkinnedMesh included — `isMesh` is true there). */
function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  return meshes
}

/** Accumulates warnings, deduped by (code, subject) so N instances don't shout N times. */
export class WarningSink {
  private readonly seen = new Set<string>()
  readonly list: ImportWarning[] = []
  add(w: ImportWarning): void {
    const key = `${w.code}|${w.subject}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.list.push(w)
  }
}

/**
 * Analyzes a loaded model into the plan the dialog shows and {@link normalizeImport} consumes.
 * Never mutates `model` — the only writes are to matrices we allocate here, and the world
 * matrices we refresh on the scene graph (three's own cache, not data).
 */
export function analyzeImport(model: LoadedModel, opts: ImportOptions): ImportPlan {
  const warnings = new WarningSink()
  const scene = model.scene
  scene.updateMatrixWorld(true)

  // Everything is expressed relative to the scene root, so a non-identity root (a caller-built
  // group, or a glTF whose scene node carries a transform) doesn't leak into placements.
  const rootInverse = new THREE.Matrix4().copy(scene.matrixWorld).invert()
  const rootIsIdentity = rootInverse.equals(IDENTITY)
  const correction = correctionMatrix(opts)

  const animations = scene.animations ?? []
  if (animations.length > 0) {
    warnings.add({
      code: 'animations',
      subject: model.fileName,
      message: `${animations.length} glTF animation${
        animations.length === 1 ? '' : 's'
      } in this file are not imported (the base pose is used).`,
      remedy: "Author motion with flexo's own animation editor after importing.",
    })
  }

  const groups = new Map<string, ImportGroup>()
  const materials = new Set<string>()
  /** How many groups each source-node NAME produced — drives the "Node · Material" naming. */
  const groupsPerNode = new Map<string, number>()

  for (const mesh of collectMeshes(scene)) {
    const nodeName = mesh.name || 'Object'
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (meshMaterials.length > 1) {
      warnings.add({
        code: 'multiMaterial',
        subject: nodeName,
        message: `"${nodeName}" uses ${meshMaterials.length} materials → ${meshMaterials.length} SubParts (KSA renders one material per SubPart).`,
      })
    }

    // Node world matrix relative to the scene root, then the import correction.
    const world = rootIsIdentity
      ? mesh.matrixWorld.clone()
      : new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld)
    world.premultiply(correction)

    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true
    if (skinned) {
      warnings.add({
        code: 'skinned',
        subject: nodeName,
        message: `"${nodeName}" is a skinned mesh; its bind pose was baked into static geometry (KSA parts have no GPU skinning).`,
      })
    }
    if (Object.keys(mesh.geometry.morphAttributes).length > 0) {
      warnings.add({
        code: 'morphTargets',
        subject: nodeName,
        message: `"${nodeName}" has shape keys (morph targets); only the base shape is imported.`,
      })
    }
    if (world.determinant() < 0) {
      warnings.add({
        code: 'mirrored',
        subject: nodeName,
        message: `"${nodeName}" has a mirrored (negative-scale) transform; it was baked into the geometry with the triangle winding fixed.`,
      })
    }

    for (let mi = 0; mi < meshMaterials.length; mi++) {
      const material = meshMaterials[mi]
      if (!material) continue
      materials.add(material.uuid)
      const key = `${mesh.geometry.uuid}|${material.uuid}`
      const existing = groups.get(key)
      if (existing) {
        existing.instances.push({ nodeName, matrix: world.clone() })
        continue
      }

      // The geometry this group owns. Multi-material meshes take only their own index ranges
      // (see subGeometryForMaterial); everything else shares the loaded scene's geometry.
      const geometry =
        meshMaterials.length > 1 ? subGeometryForMaterial(mesh.geometry, mi) : mesh.geometry
      inspectGeometry(geometry, nodeName, warnings)

      // A skinned mesh has no usable node-local space (its vertices are driven by the
      // skeleton), so it bakes to scene-root space here and its instance is the correction
      // alone — the same CPU bind-pose bake the kitten part-ify pipeline uses.
      let skinnedRootBake: THREE.BufferGeometry | undefined
      if (skinned) {
        skinnedRootBake = bakeGeometry(mesh)
        if (!rootIsIdentity) skinnedRootBake.applyMatrix4(rootInverse)
        skinnedRootBake.applyMatrix4(correction)
      }

      const group: ImportGroup = {
        key,
        suggestedName: nodeName,
        sourceNode: nodeName,
        sourceMaterial: material.name || 'Material',
        material,
        materialIndex: model.source?.materialIndex(material) ?? null,
        geometry,
        triangles: triangleCount(skinnedRootBake ?? geometry),
        vertices: vertexCount(skinnedRootBake ?? geometry),
        instances: [{ nodeName, matrix: skinnedRootBake ? correction.clone() : world.clone() }],
      }
      if (skinnedRootBake) group.skinnedRootBake = skinnedRootBake
      inspectMaterial(material, warnings)
      inspectGltfMaterial(model.source, group.materialIndex, group.sourceMaterial, warnings)
      groups.set(key, group)
      groupsPerNode.set(nodeName, (groupsPerNode.get(nodeName) ?? 0) + 1)
    }
  }

  const list = [...groups.values()]
  // Disambiguate only where a node actually split; a one-material object keeps its plain name.
  for (const group of list) {
    if ((groupsPerNode.get(group.sourceNode) ?? 0) > 1) {
      group.suggestedName = `${group.sourceNode} · ${group.sourceMaterial}`
    }
    if (group.triangles > HEAVY_MESH_TRIANGLES) {
      warnings.add({
        code: 'heavyMesh',
        subject: group.suggestedName,
        message: `"${group.suggestedName}" is ${group.triangles.toLocaleString()} triangles — very heavy for one SubPart; the in-game editor's per-hover CPU picking may be slow.`,
        remedy: 'Decimate the mesh in Blender before exporting.',
      })
    }
  }

  if (list.length === 0) {
    warnings.add({
      code: 'noMeshes',
      subject: model.fileName,
      message: 'This file contains no meshes to import.',
      remedy: 'Export with "Selected Objects" off, or check that the objects have geometry.',
    })
  }

  const totals = {
    subParts: list.length,
    placements: list.reduce((n, g) => n + g.instances.length, 0),
    triangles: list.reduce((n, g) => n + g.triangles, 0),
    vertices: list.reduce((n, g) => n + g.vertices, 0),
    materials: materials.size,
  }
  if (totals.triangles > HEAVY_IMPORT_TRIANGLES) {
    warnings.add({
      code: 'heavyMesh',
      subject: model.fileName,
      message: `This import is ${totals.triangles.toLocaleString()} triangles in total — well past the ~${HEAVY_IMPORT_TRIANGLES.toLocaleString()} budget a part should stay under.`,
      remedy: 'Decimate in Blender, or import only the objects you need.',
    })
  }

  return {
    fileName: model.fileName,
    groups: list,
    warnings: warnings.list,
    totals,
    bounds: boundsOf(list),
  }
}

/** Geometry-level warnings: the attributes KSA reads, and the ones it never will. */
function inspectGeometry(
  geometry: THREE.BufferGeometry,
  nodeName: string,
  warnings: WarningSink,
): void {
  // MeshReference.cs:83 imports POSITION/NORMAL/TEXCOORD_0 only — everything else is dead weight.
  const hasUv = geometry.hasAttribute('uv')
  const hasUv1 = geometry.hasAttribute('uv1')
  if (!hasUv && !hasUv1) {
    warnings.add({
      code: 'noUv',
      subject: nodeName,
      message: `"${nodeName}" has no UV map — textures can't be applied to it.`,
      remedy: 'UV-unwrap the object in Blender and re-export.',
    })
  } else if (hasUv1) {
    warnings.add({
      code: 'uv1',
      subject: nodeName,
      message: hasUv
        ? `"${nodeName}" has a second UV set; KSA reads UV0 only, so it is dropped.`
        : `"${nodeName}" only has a second UV set; it is promoted to UV0 (KSA reads UV0 only).`,
      remedy: hasUv
        ? 'Make the map you want to texture with the first UV set in Blender.'
        : undefined,
    })
  }
  if (!geometry.hasAttribute('normal')) {
    warnings.add({
      code: 'noNormals',
      subject: nodeName,
      message: `"${nodeName}" has no normals — flat shading is computed at import.`,
    })
  }
  if (geometry.hasAttribute('color')) {
    warnings.add({
      code: 'vertexColors',
      subject: nodeName,
      message: `"${nodeName}" has vertex colours, which KSA never reads.`,
      remedy: 'Bake them into a base-colour texture in Blender.',
    })
  }
}

/** Material-level warnings for the surface behaviours KSA's part shader simply doesn't have. */
function inspectMaterial(material: THREE.Material, warnings: WarningSink): void {
  const name = material.name || 'Material'
  // PartModelRenderer.cs:165 sets CullMode = BackBit unconditionally — there is no XML switch.
  if (material.side === THREE.DoubleSide) {
    warnings.add({
      code: 'doubleSided',
      subject: name,
      message: `"${name}" is double-sided; KSA always culls back faces, so those surfaces are invisible from behind.`,
      remedy:
        'Turn on "Make double-sided" to duplicate + flip the geometry, or solidify it in Blender.',
    })
  }
  // GLTFLoader maps alphaMode MASK → alphaTest, BLEND → transparent.
  if (material.alphaTest > 0) {
    warnings.add({
      code: 'alphaMask',
      subject: name,
      message: `"${name}" uses alpha cutout (alphaMode MASK), which KSA's part shader doesn't support.`,
      remedy: 'Bake the cutout into the geometry in Blender.',
    })
  } else if (material.transparent) {
    warnings.add({
      code: 'alphaBlend',
      subject: name,
      message: `"${name}" is translucent (alphaMode BLEND). It exports opaque unless you turn on glass, and KSA's glass is a fixed ~75% opacity that can't glow.`,
      remedy: 'Enable the per-mesh glass toggle after importing.',
    })
  }
}

/**
 * glTF material extensions with no KSA equivalent. KSA's part shader is a plain
 * metallic-roughness PBR pass (Content/Core/Shaders/MeshIndirect.frag) with five texture
 * slots and no scalars (decomp/KSA/PbrMaterialReference.cs) — there is nowhere to put a
 * clearcoat lobe, a transmission factor or an IOR, and `unlit` has no unlit pipeline.
 * KHR_materials_emissive_strength is deliberately ABSENT: the importer bakes it (§3.4).
 */
const UNSUPPORTED_MATERIAL_EXTENSIONS: Readonly<Record<string, string>> = {
  KHR_materials_clearcoat: 'clearcoat',
  KHR_materials_transmission: 'transmission',
  KHR_materials_sheen: 'sheen',
  KHR_materials_specular: 'specular',
  KHR_materials_volume: 'volume',
  KHR_materials_ior: 'index of refraction',
  KHR_materials_unlit: 'unlit shading',
}

/** glTF sampler wrap mode REPEAT — the only one KSA can honour. */
const GLTF_WRAP_REPEAT = 10497

/**
 * Warnings that are only visible in the glTF JSON: three's `MeshStandardMaterial` folds
 * factors in, drops the extensions it can't express, and turns wrap modes into three enums,
 * so the source document is the only place these survive. Silently ignoring them would mean
 * a model that looks right in Blender and wrong in KSA with no explanation.
 */
function inspectGltfMaterial(
  source: ModelSource | undefined,
  materialIndex: number | null,
  name: string,
  warnings: WarningSink,
): void {
  if (!source || materialIndex === null) return
  const def = source.json.materials?.[materialIndex]
  if (!def) return

  for (const [ext, label] of Object.entries(UNSUPPORTED_MATERIAL_EXTENSIONS)) {
    if (def.extensions?.[ext] === undefined) continue
    warnings.add({
      code: 'materialExtension',
      subject: `${name}:${ext}`,
      message: `"${name}" uses ${ext} (${label}), which KSA's part shader has no equivalent for — it is ignored.`,
      remedy: `Bake the ${label} look into the base colour / roughness maps in Blender.`,
    })
  }

  const refs: [string, GltfTextureRef | undefined][] = [
    ['base colour', def.pbrMetallicRoughness?.baseColorTexture],
    ['metallic-roughness', def.pbrMetallicRoughness?.metallicRoughnessTexture],
    ['normal', def.normalTexture],
    ['occlusion', def.occlusionTexture],
    ['emissive', def.emissiveTexture],
  ]
  for (const [channel, ref] of refs) {
    if (!ref) continue
    // KSA samples ALL five PbrMaterial slots from TEXCOORD_0 (MeshReference.cs:83 imports
    // Normals|UVs only), so a channel on UV1 samples the wrong coordinates in-game.
    if ((ref.texCoord ?? 0) !== 0) {
      warnings.add({
        code: 'textureUv1',
        subject: `${name}:${channel}`,
        message: `"${name}" samples its ${channel} map from a second UV set; KSA reads UV0 for every texture slot.`,
        remedy: 'Use the first UV set for all maps in Blender.',
      })
    }
    // KHR_texture_transform is a per-reference UV offset/scale/rotate. KSA has no such
    // uniform, and baking it would need a per-channel UV rewrite the mesh can't carry.
    if (ref.extensions?.KHR_texture_transform !== undefined) {
      warnings.add({
        code: 'textureTransform',
        subject: `${name}:${channel}`,
        message: `"${name}" applies a UV transform (KHR_texture_transform) to its ${channel} map, which KSA cannot express.`,
        remedy: 'Apply the transform to the UV map itself in Blender and re-export.',
      })
    }

    const texture = source.json.textures?.[ref.index]
    if (!texture) continue
    // A KHR_texture_basisu image is already block-compressed; flexo must decode to pixels to
    // re-encode its own KTX2 (and to bake factors), and a supercompressed texture can't be
    // CPU-decoded here — KTX2Loader needs a WebGLRenderer to pick a transcode target.
    if (texture.extensions?.KHR_texture_basisu !== undefined) {
      warnings.add({
        code: 'basisuImage',
        subject: `${name}:${channel}`,
        message: `"${name}"'s ${channel} map is a compressed KTX2 image (KHR_texture_basisu), which flexo cannot re-encode.`,
        remedy: 'Re-export from Blender with Images = Automatic (PNG/JPEG).',
      })
    }
    // decomp/KSA/PartModelRenderer.cs:40-42 builds ONE global sampler with
    // AddressModeU/V/W = Repeat; per-texture clamp/mirror simply does not exist in-game.
    const sampler =
      texture.sampler === undefined ? undefined : source.json.samplers?.[texture.sampler]
    const wrapS = sampler?.wrapS ?? GLTF_WRAP_REPEAT
    const wrapT = sampler?.wrapT ?? GLTF_WRAP_REPEAT
    if (wrapS !== GLTF_WRAP_REPEAT || wrapT !== GLTF_WRAP_REPEAT) {
      warnings.add({
        code: 'samplerWrap',
        subject: `${name}:${channel}`,
        message: `"${name}"'s ${channel} map uses a clamp/mirror wrap mode; KSA's sampler is hard-wired to Repeat.`,
        remedy: 'Keep the UVs inside 0–1, or bake the clamped result into the image.',
      })
    }
  }
}

/** Union of every instance's transformed geometry bounding box, in metres. */
function boundsOf(groups: ImportGroup[]): ImportPlan['bounds'] {
  const box = new THREE.Box3()
  for (const group of groups) {
    const source = group.skinnedRootBake ?? group.geometry
    if (!source.boundingBox) source.computeBoundingBox()
    const local = source.boundingBox
    if (!local) continue
    for (const instance of group.instances) {
      box.union(local.clone().applyMatrix4(instance.matrix))
    }
  }
  if (box.isEmpty()) {
    return { min: new THREE.Vector3(), max: new THREE.Vector3(), size: new THREE.Vector3() }
  }
  return { min: box.min.clone(), max: box.max.clone(), size: box.getSize(new THREE.Vector3()) }
}
