import * as THREE from 'three'
import type { Vec3 } from '../ksa/types'
import type { BoundsMode } from '../state/measurementStore'

/**
 * Bounding-box math for the selection measurement box. Two modes:
 *  - 'world': axis-aligned box in world space (true width/height/depth).
 *  - 'oriented': a tight box in the selection's local frame (the last object's
 *    world rotation). For a single rotated mesh this hugs the mesh; for a
 *    multi-selection it uses that one frame as a pragmatic approximation (not a
 *    true minimum-volume OBB across arbitrary meshes).
 */

export interface ComputedBounds {
  /** Dimensions along the box axes, in meters. */
  size: Vec3
  /** Box center in world space. */
  center: Vec3
  /** Box min corner — world space for 'world', frame-local for 'oriented'. */
  min: Vec3
  /** Box max corner — world space for 'world', frame-local for 'oriented'. */
  max: Vec3
  /** Box orientation in world space as a quaternion [x, y, z, w]; identity for 'world'. */
  quaternion: [number, number, number, number]
}

const toVec3 = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z })

/** Computes the selection box for the given scene objects, or null if empty/degenerate. */
export function computeSelectionBounds(
  objects: THREE.Object3D[],
  mode: BoundsMode,
): ComputedBounds | null {
  if (objects.length === 0) return null

  if (mode === 'world') {
    const box = new THREE.Box3()
    for (const obj of objects) box.expandByObject(obj)
    if (box.isEmpty()) return null
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    return {
      size: toVec3(size),
      center: toVec3(center),
      min: toVec3(box.min),
      max: toVec3(box.max),
      quaternion: [0, 0, 0, 1],
    }
  }

  // Oriented: AABB computed in the frame of the last object's world rotation.
  const frame = new THREE.Quaternion()
  objects[objects.length - 1].getWorldQuaternion(frame)
  const inv = frame.clone().invert()

  const localBox = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const obj of objects) {
    obj.updateWorldMatrix(true, true)
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      const geom = mesh.geometry as THREE.BufferGeometry | undefined
      const pos = geom?.attributes?.position as THREE.BufferAttribute | undefined
      if (!mesh.isMesh || !pos) return
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        v.applyMatrix4(mesh.matrixWorld)
        v.applyQuaternion(inv)
        localBox.expandByPoint(v)
      }
    })
  }
  if (localBox.isEmpty()) return null

  const size = new THREE.Vector3()
  const localCenter = new THREE.Vector3()
  localBox.getSize(size)
  localBox.getCenter(localCenter)
  const center = localCenter.clone().applyQuaternion(frame)
  return {
    size: toVec3(size),
    center: toVec3(center),
    min: toVec3(localBox.min),
    max: toVec3(localBox.max),
    quaternion: [frame.x, frame.y, frame.z, frame.w],
  }
}

/** Euclidean distance between two points, in meters. */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Closest points between two axis-aligned boxes (the gap / clearance between
 * them). For overlapping axes the points meet at the overlap midpoint, so the
 * distance is 0 when the boxes intersect.
 */
export function closestPointsBetweenBoxes(
  aMin: Vec3,
  aMax: Vec3,
  bMin: Vec3,
  bMax: Vec3,
): { a: Vec3; b: Vec3; distance: number } {
  const axis = (loA: number, hiA: number, loB: number, hiB: number): [number, number] => {
    if (hiA < loB) return [hiA, loB] // A entirely below B
    if (hiB < loA) return [loA, hiB] // B entirely below A
    const mid = (Math.max(loA, loB) + Math.min(hiA, hiB)) / 2 // overlap
    return [mid, mid]
  }
  const [ax, bx] = axis(aMin.x, aMax.x, bMin.x, bMax.x)
  const [ay, by] = axis(aMin.y, aMax.y, bMin.y, bMax.y)
  const [az, bz] = axis(aMin.z, aMax.z, bMin.z, bMax.z)
  const a: Vec3 = { x: ax, y: ay, z: az }
  const b: Vec3 = { x: bx, y: by, z: bz }
  return { a, b, distance: distance(a, b) }
}
