import * as THREE from 'three'
import type { EulerXYZ, Transform, Vec3 } from '../ksa/types'

/**
 * The single chokepoint for converting between KSA Part-space transforms (as
 * stored in XML / the editor store) and three.js Object3D transforms.
 *
 * COORDINATE MAPPING (calibrated against KSA's Brutal engine source):
 *   KSA and three.js share the SAME basis — right-handed, Y-up, -Z-forward,
 *   meters (KSA: Up=(0,1,0), Right=(1,0,0), Forward=(0,0,-1), see Double3Ex.cs).
 *   So position and scale are applied DIRECTLY, no axis swap or sign flip.
 *
 *   Rotation needs an Euler-ORDER change, though. KSA stores rotation as Euler
 *   "XYZ" radians, but its quat<->euler conversion (QuaternionEx.CreateFromXyzRadians /
 *   ToXyzRadians) composes the axes in the opposite multiplication order from
 *   three.js's 'XYZ'. Numerically, KSA's "XYZ" is bit-for-bit three.js 'ZYX'.
 *   Single-axis rotations are identical under either order (which is why simple
 *   parts looked fine), but multi-axis rotations only match with 'ZYX'.
 *
 * CALIBRATION: load the Core part `CoreCouplingA_Prefab_DockingPort1WA`
 * (open the app with `?debug=dockingport`) and confirm it assembles into a
 * coherent, radially-symmetric docking port. If it ever looks scrambled, the
 * Euler order / axis mapping is the knob — change it HERE ONLY; every other
 * module routes transforms through these two functions.
 */

// KSA's Euler "XYZ" equals three.js 'ZYX' (opposite compose order) — see above.
const EULER_ORDER = 'ZYX' as const

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
