import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { transformFromMatrix } from '../three/coords'
import { randomId } from '../state/ids'
import { buildMeshAtlasGlb } from './exportGlb'
import {
  canMerge,
  type ImportGroup,
  type ImportOptions,
  type ImportPlan,
  type ImportWarning,
} from './importPlan'
import type { Transform } from './types'

/**
 * NORMALIZATION pass of the model importer: an {@link ImportPlan} → KSA-legal geometry, KSA-space
 * placements, and the one atlas GLB that becomes the import batch's only copy of the geometry
 * (IndexedDB, `assetKeys.importGlb`). Everything here exists to satisfy a hard game fact; each
 * step is commented with the one it serves. Verified against the 2026.7.9.5018 decomp.
 *
 * The output is deliberately descriptor-shaped: nothing touches the editor document, IndexedDB
 * or the exporter — the store wiring is a separate concern, and this module stays unit-testable.
 */

// ── output shape ─────────────────────────────────────────────────────────────

/** One normalized SubPart-to-be: KSA-legal geometry plus where every copy of it goes. */
export interface NormalizedMesh {
  /** `flexo_<Sanitized(name)>_<hash8>` — the GLB node+mesh name AND the future SubPart Id. */
  subPartId: string
  /** Display name (the plan's suggested name, with {@link ImportOptions.namePrefix}). */
  name: string
  sourceNode: string
  sourceMaterial: string
  /** The originating {@link ImportGroup.key} — Phase 2 attaches the CustomMaterial through it. */
  materialGroupKey: string
  triangles: number
  vertices: number
  /** Normalized geometry (indexed, POSITION/NORMAL/TEXCOORD_0). Freshly allocated — caller owns disposal. */
  geometry: THREE.BufferGeometry
  /** KSA-space transforms, one per instance in the plan's order. */
  placements: Transform[]
}

export interface NormalizedImport {
  /** Import batch id, `imp_<hash8>` — the IndexedDB key suffix for {@link glb}. */
  importId: string
  fileName: string
  /** Geometry atlas: one named mesh per {@link meshes} entry, and NO `_VM` meshes (see below). */
  glb: Uint8Array
  meshes: NormalizedMesh[]
  warnings: ImportWarning[]
}

// ── normalization ────────────────────────────────────────────────────────────

/** three attribute names KSA's mesh loader imports — `VertexImportFlags.Normals | UVs`
 *  (decomp/KSA/MeshReference.cs:83). TANGENT / COLOR_0 / TEXCOORD_1 / JOINTS / WEIGHTS are never
 *  read, so they are dropped here rather than shipped as dead weight. */
const KSA_READ_ATTRIBUTES = new Set(['position', 'normal', 'uv'])

const IDENTITY = new THREE.Matrix4()

/** 8 hex chars from {@link randomId} (never `crypto.randomUUID` directly — see ids.ts). */
function shortId(): string {
  return randomId().replace(/-/g, '').slice(0, 8)
}

/** Asset-id-safe token: KSA ids are referenced by string from XML, so keep them alphanumeric. */
function sanitizeIdent(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Mesh'
}

/** The pure-scale part of a matrix (three's decompose folds a mirror into `scale.x`). */
function scaleMatrixOf(m: THREE.Matrix4): THREE.Matrix4 {
  const scale = new THREE.Vector3()
  m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
  return new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)
}

/** Reverses every triangle's winding in place (indices only — the geometry must be indexed). */
function reverseWinding(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex()
  if (!index) return
  const array = index.array
  for (let i = 0; i + 2 < array.length; i += 3) {
    const first = array[i]!
    array[i] = array[i + 2]!
    array[i + 2] = first
  }
  index.needsUpdate = true
}

function negateNormals(geometry: THREE.BufferGeometry): void {
  const normal = geometry.getAttribute('normal')
  if (!normal) return
  for (let i = 0; i < normal.count; i++) {
    normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i))
  }
  normal.needsUpdate = true
}

/**
 * The matrix baked into a group's geometry, and therefore divided back out of every placement.
 *
 *  - `bakeTransforms` → the FULL world matrix of the FIRST instance. Instance 0's placement
 *    becomes identity ("bake to origin"); any further instance keeps its offset RELATIVE to
 *    instance 0 rather than duplicating the geometry N times, which is the whole point of the
 *    one-SubPart-N-placements rule (plan §3.2).
 *  - otherwise, the first instance's SCALE — including the import scale — when
 *    {@link ImportOptions.bakeScale} is on, so texel density and the editor gizmo behave
 *    predictably. Rotation and translation ride the placement (KSA placements carry all three).
 *  - MIRRORED transforms force the scale bake even with `bakeScale` off: three's `decompose`
 *    folds a negative determinant into `scale.x`, so baking the scale is exactly what removes
 *    the mirror from the placement. A negative placement scale would reverse the winding
 *    in-game and back-face-cull the whole piece (CullMode = BackBit is unconditional,
 *    decomp/KSA/PartModelRenderer.cs:165) — an invisible part with no error.
 */
function bakeMatrixFor(group: ImportGroup, opts: ImportOptions): THREE.Matrix4 {
  const first = group.instances[0]?.matrix ?? IDENTITY
  if (opts.bakeTransforms) return first.clone()
  const mirrored = group.instances.some((i) => i.matrix.determinant() < 0)
  if (opts.bakeScale || mirrored) return scaleMatrixOf(first)
  return new THREE.Matrix4()
}

/**
 * Builds the KSA-legal geometry for one group: attribute normalization, the transform bake,
 * mirror correction, and optional double-siding.
 */
function normalizeGeometry(group: ImportGroup, opts: ImportOptions, bake: THREE.Matrix4) {
  // A skinned mesh has no node-local space — the plan already CPU-baked its bind pose to
  // scene-root space (KSA has no GPU skinning), so that is the source here.
  let geometry = (group.skinnedRootBake ?? group.geometry).clone()

  // TEXCOORD_1 → TEXCOORD_0, but only when there is no UV0 to lose: KSA samples every map from
  // UV0 (all five PbrMaterial slots), so a UV1-only mesh is otherwise untexturable. Never
  // invent UVs when there are none at all — the 'noUv' warning already tells the user.
  if (!geometry.hasAttribute('uv') && geometry.hasAttribute('uv1')) {
    geometry.setAttribute('uv', geometry.getAttribute('uv1'))
  }
  for (const name of Object.keys(geometry.attributes)) {
    if (!KSA_READ_ATTRIBUTES.has(name)) geometry.deleteAttribute(name)
  }
  geometry.morphAttributes = {}
  geometry.clearGroups()

  // Indices are MANDATORY: GltfUtils.cs:484-488 only builds an index buffer
  // `if (prim.Indices.HasValue)`, so a non-indexed primitive draws zero triangles and its CPU
  // picking span is empty (MeshReference.cs:90-96) — invisible and unpickable, with no error.
  if (!geometry.getIndex()) {
    const count = geometry.getAttribute('position')?.count ?? 0
    const index = count > 65536 ? new Uint32Array(count) : new Uint16Array(count)
    for (let i = 0; i < count; i++) index[i] = i
    geometry.setIndex(new THREE.BufferAttribute(index, 1))
  }

  if (!bake.equals(IDENTITY)) {
    // applyMatrix4 transforms normals by the inverse-transpose, which is already the correct
    // mirrored normal; only the WINDING needs repairing, because a negative determinant flips
    // the triangle order relative to those normals.
    geometry.applyMatrix4(bake)
    if (bake.determinant() < 0) reverseWinding(geometry)
  }

  // Missing normals are computed AFTER the bake so the result is right for a mirrored geometry.
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals()

  if (opts.doubleSided) {
    // KSA culls back faces unconditionally, so "double-sided" has to be geometry: a second,
    // wound-reversed and normal-negated copy of the surface facing the other way.
    const back = geometry.clone()
    reverseWinding(back)
    negateNormals(back)
    const merged = mergeGeometries([geometry, back], false)
    geometry.dispose()
    back.dispose()
    if (!merged) throw new Error('normalizeImport: failed to build the double-sided geometry')
    geometry = merged
  }

  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** A file name without its extension — the merged SubPart's default display name. */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || 'Model'
}

/**
 * "Merge into one SubPart": every group × instance baked into ONE geometry with a single
 * identity placement — one draw, one `<PartModel>`, one `<MeshView>`. Legal only for a
 * single-material model ({@link canMerge}), because a `<PartModel>` binds exactly one
 * material.
 *
 * Each piece goes through the SAME {@link normalizeGeometry} every unmerged mesh does, with
 * the instance's FULL world matrix as the bake — so indices, attribute stripping, mirror
 * winding repair and optional double-siding are identical; only the combination is new.
 * Returns null (with a warning) when the pieces can't be combined — `mergeGeometries` refuses
 * a set whose attribute layouts differ (e.g. one object UV-unwrapped and another not), and an
 * unmerged import is strictly better than a failed one.
 */
function mergeAll(
  plan: ImportPlan,
  opts: ImportOptions,
  warnings: ImportWarning[],
): NormalizedMesh | null {
  const pieces: THREE.BufferGeometry[] = []
  for (const group of plan.groups) {
    for (const instance of group.instances) {
      pieces.push(normalizeGeometry(group, opts, instance.matrix))
    }
  }
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  if (!merged) {
    warnings.push({
      code: 'mergeFailed',
      subject: plan.fileName,
      message:
        'These objects could not be merged into one SubPart (their vertex attributes differ — usually one is UV-unwrapped and another is not), so they were imported separately.',
      remedy: 'UV-unwrap every object in Blender, or import without merging.',
    })
    return null
  }
  merged.computeBoundingBox()
  merged.computeBoundingSphere()

  const first = plan.groups[0]!
  const name = `${opts.namePrefix}${baseName(plan.fileName)}`
  const index = merged.getIndex()
  return {
    subPartId: `flexo_${sanitizeIdent(name)}_${shortId()}`,
    name,
    sourceNode:
      plan.groups.length === 1 ? first.sourceNode : `${plan.groups.length} objects (merged)`,
    sourceMaterial: first.sourceMaterial,
    // The FIRST group's key: every group shares the one material here (canMerge), and this is
    // what maps the merged mesh onto the material plan's spec (materialKeyByGroup).
    materialGroupKey: first.key,
    triangles: index ? Math.floor(index.count / 3) : 0,
    vertices: merged.getAttribute('position')?.count ?? 0,
    geometry: merged,
    placements: [transformFromMatrix(new THREE.Matrix4())],
  }
}

/**
 * Normalizes an analyzed plan into SubPart-ready geometry, placements and one atlas GLB.
 * Throws when the plan has nothing to import (the dialog gates on the 'noMeshes' warning).
 */
export async function normalizeImport(
  plan: ImportPlan,
  opts: ImportOptions,
): Promise<NormalizedImport> {
  if (plan.groups.length === 0) {
    throw new Error(`normalizeImport: "${plan.fileName}" contains no meshes to import.`)
  }

  const warnings = [...plan.warnings]
  if (opts.merge && canMerge(plan)) {
    const merged = mergeAll(plan, opts, warnings)
    if (merged) {
      const glb = await buildMeshAtlasGlb([{ name: merged.subPartId, geometry: merged.geometry }], {
        viewMeshes: false,
      })
      return {
        importId: `imp_${shortId()}`,
        fileName: plan.fileName,
        glb,
        meshes: [merged],
        warnings,
      }
    }
  }

  const meshes: NormalizedMesh[] = []
  for (const group of plan.groups) {
    const bake = bakeMatrixFor(group, opts)
    const geometry = normalizeGeometry(group, opts, bake)

    // placement_i = M_i · bake⁻¹ — whatever the geometry did NOT absorb. Decomposed through
    // coords.transformFromMatrix so imported placements use the SAME calibrated euler order
    // (KSA's "XYZ" == three's 'ZYX') as hand-authored ones; never hand-roll euler extraction.
    const inverseBake = bake.clone().invert()
    const placements = group.instances.map((instance) =>
      transformFromMatrix(new THREE.Matrix4().multiplyMatrices(instance.matrix, inverseBake)),
    )

    const name = `${opts.namePrefix}${group.suggestedName}`
    const index = geometry.getIndex()
    meshes.push({
      // `flexo_` prefix is mandatory: MeshReference registers mesh names GLOBALLY in
      // ModLibrary (decomp/KSA/MeshReference.cs:60-63), so an un-prefixed name can collide
      // with Core content.
      subPartId: `flexo_${sanitizeIdent(name)}_${shortId()}`,
      name,
      sourceNode: group.sourceNode,
      sourceMaterial: group.sourceMaterial,
      materialGroupKey: group.key,
      triangles: index ? Math.floor(index.count / 3) : 0,
      vertices: geometry.getAttribute('position')?.count ?? 0,
      geometry,
      placements,
    })
  }

  // ONE GLB per import batch, one named mesh per SubPart, and NO `_VM` view meshes: this atlas
  // is flexo's own geometry store, not something KSA loads. The `_VM` pairs the game needs are
  // generated from the same geometry at mod-export time (see exportGlb's VIEW MESHES header).
  const glb = await buildMeshAtlasGlb(
    meshes.map((m) => ({ name: m.subPartId, geometry: m.geometry })),
    { viewMeshes: false },
  )

  return { importId: `imp_${shortId()}`, fileName: plan.fileName, glb, meshes, warnings }
}
