import * as THREE from 'three'
import type {
  BoxParams,
  CylinderParams,
  FaceTextureConfig,
  PlaneParams,
  PrimitiveKind,
  PrimitiveSpec,
  SphereParams,
} from '../ksa/types'

/**
 * Parametric primitive shapes for user-created custom meshes. Each builder returns
 * an indexed BufferGeometry with POSITION / NORMAL / TEXCOORD_0 attributes — the
 * exact attribute set KSA's built-in mesh-atlas GLBs use (verified against
 * CoreStructuralA_MeshAtlas.glb) — so the result exports cleanly through
 * GLTFExporter and re-imports through MeshAtlasCache like any Core SubPart.
 *
 * Geometry is authored in three.js's natural Y-up orientation and centered on the
 * origin (matching how built-in SubParts bake their local origin). One image is
 * stretched across the whole mesh via the primitive's default UVs (v1 scope —
 * see plans/FLEXO_CUSTOM_ASSETS.md). The shape/param TYPES live in ksa/types.ts
 * (framework-agnostic, so the document model can reference them without three).
 */

export const DEFAULT_PRIMITIVE_PARAMS: {
  box: BoxParams
  cylinder: CylinderParams
  sphere: SphereParams
  plane: PlaneParams
} = {
  box: { width: 1, height: 1, depth: 1 },
  cylinder: { radius: 0.5, height: 1, radialSegments: 32 },
  sphere: { radius: 0.5, segments: 32 },
  plane: { width: 1, height: 1 },
}

export function defaultSpec(kind: PrimitiveKind): PrimitiveSpec {
  switch (kind) {
    case 'box':
      return { kind, params: { ...DEFAULT_PRIMITIVE_PARAMS.box } }
    case 'cylinder':
      return { kind, params: { ...DEFAULT_PRIMITIVE_PARAMS.cylinder } }
    case 'sphere':
      return { kind, params: { ...DEFAULT_PRIMITIVE_PARAMS.sphere } }
    case 'plane':
      return { kind, params: { ...DEFAULT_PRIMITIVE_PARAMS.plane } }
  }
}

/**
 * Builds an indexed BufferGeometry for the given spec. Caller owns disposal.
 * three's primitive geometries already provide position/normal/uv; PlaneGeometry
 * is non-indexed-friendly but three returns it indexed, consistent with the rest.
 */
export function buildPrimitiveGeometry(spec: PrimitiveSpec): THREE.BufferGeometry {
  switch (spec.kind) {
    case 'box': {
      const { width, height, depth } = spec.params
      return new THREE.BoxGeometry(width, height, depth)
    }
    case 'cylinder': {
      const { radius, height, radialSegments } = spec.params
      return new THREE.CylinderGeometry(radius, radius, height, Math.max(3, radialSegments))
    }
    case 'sphere': {
      const { radius, segments } = spec.params
      const s = Math.max(3, segments)
      return new THREE.SphereGeometry(radius, s * 2, s)
    }
    case 'plane': {
      const { width, height } = spec.params
      return new THREE.PlaneGeometry(width, height)
    }
  }
}

/** Human label for a primitive kind (UI menus, default mesh names). */
export const PRIMITIVE_LABELS: Record<PrimitiveKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  plane: 'Plane',
}

export const PRIMITIVE_KINDS: readonly PrimitiveKind[] = ['box', 'cylinder', 'sphere', 'plane']

/**
 * Ordered face-group key names for each primitive kind. The order matches
 * Three.js geometry group materialIndex values for that primitive:
 *   Box      → right(+X), left(−X), top(+Y), bottom(−Y), front(+Z), back(−Z)
 *   Cylinder → side, top, bottom  (CylinderGeometry group order)
 *   Sphere   → all  (no groups; treated as a single surface)
 *   Plane    → all  (no groups)
 */
export const PRIMITIVE_FACE_KEYS: Record<PrimitiveKind, readonly string[]> = {
  box: ['right', 'left', 'top', 'bottom', 'front', 'back'],
  cylinder: ['side', 'top', 'bottom'],
  sphere: ['all'],
  plane: ['all'],
}

/** Long label for each face key (e.g. "Right (+X)" for 'right'). */
export const FACE_LABELS: Record<string, string> = {
  right: 'Right (+X)',
  left: 'Left (−X)',
  top: 'Top (+Y)',
  bottom: 'Bottom (−Y)',
  front: 'Front (+Z)',
  back: 'Back (−Z)',
  side: 'Side',
  all: 'All Faces',
}

/**
 * Applies per-face UV scale + offset transforms to a BufferGeometry's UV attribute
 * in-place. Face groups are mapped to face keys via materialIndex into faceKeys[].
 *
 * For geometries with no groups (sphere, plane) the 'all' key is applied to the
 * entire UV buffer. For indexed geometries a per-group visited-vertex set handles
 * shared indices within a group correctly (Three.js primitives don't share vertices
 * between groups, but do share within a group's triangles).
 *
 * Faces with no config entry, or with identity scale+zero offset, are skipped.
 */
export function applyFaceUvTransforms(
  geometry: THREE.BufferGeometry,
  faceKeys: readonly string[],
  configs: Partial<Record<string, FaceTextureConfig>>,
): void {
  const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!uvAttr) return

  if (geometry.groups.length === 0) {
    const cfg = configs['all']
    if (!cfg) return
    const { x: sx, y: sy } = cfg.uvScale
    const { x: ox, y: oy } = cfg.uvOffset
    if (sx === 1 && sy === 1 && ox === 0 && oy === 0) return
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * sx + ox, uvAttr.getY(i) * sy + oy)
    }
    uvAttr.needsUpdate = true
    return
  }

  const idx = geometry.index
  for (const group of geometry.groups) {
    const key = group.materialIndex != null ? faceKeys[group.materialIndex] : undefined
    if (!key) continue
    const cfg = configs[key]
    if (!cfg) continue
    const { x: sx, y: sy } = cfg.uvScale
    const { x: ox, y: oy } = cfg.uvOffset
    if (sx === 1 && sy === 1 && ox === 0 && oy === 0) continue

    const end = group.start + group.count
    if (idx) {
      const visited = new Set<number>()
      for (let i = group.start; i < end; i++) {
        const vi = idx.getX(i)
        if (visited.has(vi)) continue
        visited.add(vi)
        uvAttr.setXY(vi, uvAttr.getX(vi) * sx + ox, uvAttr.getY(vi) * sy + oy)
      }
    } else {
      for (let i = group.start; i < end; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * sx + ox, uvAttr.getY(i) * sy + oy)
      }
    }
    uvAttr.needsUpdate = true
  }
}
