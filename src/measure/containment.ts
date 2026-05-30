import * as THREE from 'three'
import type { Vec3 } from '../ksa/types'
import type { ReferenceContainer, ReferenceShape } from '../state/containerStore'

/**
 * Containment test for reference containers: given world-space sample points
 * (mesh bounding-box corners or vertices — see {@link ContainerLayer}), returns
 * the set of region keys the points exceed. The container's warn meshes key off
 * these:
 *   - rect:     'x+' 'x-' 'y+' 'y-' 'z+' 'z-'  (the six faces)
 *   - cylinder: 'side' 'top' 'bottom'
 *   - sphere:   'sphere'
 *
 * Points are taken into the container's oriented frame (translated by -center,
 * un-rotated) and compared against its half-extents, so rotation is handled
 * without rebuilding geometry.
 */
export type ViolationRegions = Set<string>

/** Region keys a given shape can report (used to allocate warn meshes). */
export function regionKeys(shape: ReferenceShape): string[] {
  if (shape === 'rect') return ['x+', 'x-', 'y+', 'y-', 'z+', 'z-']
  if (shape === 'cylinder') return ['side', 'top', 'bottom']
  return ['sphere']
}

const _qi = new THREE.Quaternion()
const _v = new THREE.Vector3()
const EPS = 1e-6

export function evaluateViolations(worldPoints: Vec3[], c: ReferenceContainer): ViolationRegions {
  const out: ViolationRegions = new Set()
  if (worldPoints.length === 0) return out
  _qi.set(c.rotation[0], c.rotation[1], c.rotation[2], c.rotation[3]).invert()
  const hx = c.size.x / 2
  const hy = c.size.y / 2
  const hz = c.size.z / 2

  for (const p of worldPoints) {
    _v.set(p.x - c.center.x, p.y - c.center.y, p.z - c.center.z).applyQuaternion(_qi)
    if (c.shape === 'rect') {
      if (_v.x > hx + EPS) out.add('x+')
      if (_v.x < -hx - EPS) out.add('x-')
      if (_v.y > hy + EPS) out.add('y+')
      if (_v.y < -hy - EPS) out.add('y-')
      if (_v.z > hz + EPS) out.add('z+')
      if (_v.z < -hz - EPS) out.add('z-')
      if (out.size === 6) break
    } else if (c.shape === 'cylinder') {
      if (Math.hypot(_v.x, _v.z) > hx + EPS) out.add('side')
      if (_v.y > hy + EPS) out.add('top')
      if (_v.y < -hy - EPS) out.add('bottom')
      if (out.size === 3) break
    } else {
      if (_v.length() > hx + EPS) {
        out.add('sphere')
        break
      }
    }
  }
  return out
}
