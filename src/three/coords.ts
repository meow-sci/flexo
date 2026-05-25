import * as THREE from 'three'
import type { EulerXYZ, Transform, Vec3 } from '../ksa/types'

/**
 * The single chokepoint for converting between KSA Part-space transforms (as
 * stored in XML / the editor store) and three.js Object3D transforms.
 *
 * COORDINATE HYPOTHESIS (default, pending visual calibration):
 *   glTF/GLB is right-handed, Y-up, meters; three.js is the same. KSA authors
 *   SubPart transforms against the same GLB space, so we apply them DIRECTLY:
 *   position as-is, rotation as Euler XYZ radians, scale as-is. No axis flip.
 *
 * CALIBRATION: load the Core part `CoreCouplingA_Prefab_DockingPort1WA`
 * (open the app with `?debug=dockingport`) and confirm it assembles into a
 * coherent, radially-symmetric docking port. If it looks scrambled, adjust the
 * Euler order / axis signs HERE ONLY and update this comment with what was
 * verified — every other module routes transforms through these two functions.
 */

const EULER_ORDER = 'XYZ' as const

export function applyPlacement(obj: THREE.Object3D, p: Transform): void {
  obj.position.set(p.position.x, p.position.y, p.position.z)
  obj.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z, EULER_ORDER)
  obj.scale.set(p.scale.x, p.scale.y, p.scale.z)
}

export function readPlacementTransform(obj: THREE.Object3D): {
  position: Vec3
  rotation: EulerXYZ
  scale: Vec3
} {
  const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, EULER_ORDER)
  return {
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
  }
}
