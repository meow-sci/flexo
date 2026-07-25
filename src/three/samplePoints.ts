import * as THREE from 'three'
import type { Vec3 } from '../ksa/types'

/**
 * How finely a scene object is sampled into points.
 *  - `'bbox'`  — the 8 corners of each object's world AABB. Cheap; enough for a box or
 *    cylinder fit around axis-aligned geometry, and the only sane choice for very
 *    high-poly meshes.
 *  - `'vertex'` — every vertex of every mesh, in world space. Accurate for rotated /
 *    irregular geometry (a bbox-corner fit of a rotated mesh over-estimates), at the cost
 *    of walking the whole buffer.
 */
export type SamplePrecision = 'bbox' | 'vertex'

/**
 * World-space sample points for a set of scene objects. Shared by the reference-container
 * containment warnings ({@link import('./ContainerLayer').ContainerLayer}), the collider
 * fitting tools, and the collider coverage check — they all need "roughly, where is this
 * geometry", and disagreeing about it would make the readouts contradict each other.
 */
export function collectWorldPoints(
  objects: readonly THREE.Object3D[],
  mode: SamplePrecision,
): Vec3[] {
  const out: Vec3[] = []
  if (mode === 'bbox') {
    const box = new THREE.Box3()
    for (const obj of objects) {
      box.setFromObject(obj)
      if (box.isEmpty()) continue
      const { min, max } = box
      for (const x of [min.x, max.x])
        for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push({ x, y, z })
    }
    return out
  }
  const v = new THREE.Vector3()
  for (const obj of objects) {
    obj.updateWorldMatrix(true, true)
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      const pos = (mesh.geometry as THREE.BufferGeometry | undefined)?.attributes?.position as
        | THREE.BufferAttribute
        | undefined
      if (!mesh.isMesh || !pos) return
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
        out.push({ x: v.x, y: v.y, z: v.z })
      }
    })
  }
  return out
}
