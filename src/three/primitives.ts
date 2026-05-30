import * as THREE from 'three'
import type {
  BoxParams,
  CylinderParams,
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
