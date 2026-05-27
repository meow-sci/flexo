import * as THREE from 'three'
import type { EulerXYZ, Vec3 } from '../ksa/types'
import type { PlacementTransform } from '../state/editorStore'

/**
 * Pure transform math for bulk-editing a multi-selection of SubParts. Shared by
 * the 3D gizmo (EditorScene, deriving a delta quaternion from the pivot) and the
 * numeric "transform by" inspector fields, so both produce identical results.
 *
 * Semantics (per the editor's chosen behavior):
 *   - translate: add the same offset to every SubPart's position.
 *   - scale:     multiply every SubPart's own scale by the same factor, IN PLACE
 *                (positions unchanged) — the group does not spread/contract.
 *   - rotate:    rotate every SubPart around a shared origin (default: centroid),
 *                rotating both its position about the origin AND its orientation.
 *
 * Rotation uses the same Euler order as {@link applyPlacement} in coords.ts:
 * 'ZYX', because KSA's stored "XYZ" Euler equals three.js 'ZYX' (see coords.ts).
 */

const EULER_ORDER = 'ZYX' as const
const DEG2RAD = Math.PI / 180

const _pos = new THREE.Vector3()
const _objQuat = new THREE.Quaternion()
const _outQuat = new THREE.Quaternion()
const _euler = new THREE.Euler()

/** Average position of the given points (origin when empty). */
export function centroidOf(positions: readonly Vec3[]): Vec3 {
  if (positions.length === 0) return { x: 0, y: 0, z: 0 }
  let x = 0
  let y = 0
  let z = 0
  for (const p of positions) {
    x += p.x
    y += p.y
    z += p.z
  }
  const n = positions.length
  return { x: x / n, y: y / n, z: z / n }
}

/** Returns a copy of `t` translated by `delta` (rotation/scale unchanged). */
export function translatedTransform(t: PlacementTransform, delta: Vec3): PlacementTransform {
  return {
    position: { x: t.position.x + delta.x, y: t.position.y + delta.y, z: t.position.z + delta.z },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
  }
}

/** Returns a copy of `t` with its scale multiplied componentwise by `factor` (position/rotation unchanged). */
export function scaledInPlaceTransform(t: PlacementTransform, factor: Vec3): PlacementTransform {
  return {
    position: { ...t.position },
    rotation: { ...t.rotation },
    scale: { x: t.scale.x * factor.x, y: t.scale.y * factor.y, z: t.scale.z * factor.z },
  }
}

/**
 * Returns a copy of `t` rotated by `deltaQuat` about `origin`: the position is
 * rotated around the origin and the orientation is pre-multiplied by the delta
 * (scale unchanged). The result rotation is re-expressed as Euler XYZ radians.
 */
export function rotatedAroundOriginTransform(
  t: PlacementTransform,
  deltaQuat: THREE.Quaternion,
  origin: Vec3,
): PlacementTransform {
  _pos
    .set(t.position.x - origin.x, t.position.y - origin.y, t.position.z - origin.z)
    .applyQuaternion(deltaQuat)
  const position = { x: origin.x + _pos.x, y: origin.y + _pos.y, z: origin.z + _pos.z }

  _objQuat.setFromEuler(_euler.set(t.rotation.x, t.rotation.y, t.rotation.z, EULER_ORDER))
  _outQuat.copy(deltaQuat).multiply(_objQuat)
  _euler.setFromQuaternion(_outQuat, EULER_ORDER)

  return {
    position,
    rotation: { x: _euler.x, y: _euler.y, z: _euler.z },
    scale: { ...t.scale },
  }
}

/** Builds a quaternion from a per-axis rotation given in degrees (Euler XYZ). */
export function quatFromEulerDeg(deg: EulerXYZ): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(deg.x * DEG2RAD, deg.y * DEG2RAD, deg.z * DEG2RAD, EULER_ORDER),
  )
}
