import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { evaluateViolations, regionKeys } from './containment'
import type { ReferenceContainer, ReferenceShape } from '../state/containerStore'
import type { Vec3 } from '../ksa/types'

function container(
  shape: ReferenceShape,
  size: Vec3,
  rotation: [number, number, number, number] = [0, 0, 0, 1],
): ReferenceContainer {
  return {
    id: 't',
    shape,
    center: { x: 0, y: 0, z: 0 },
    rotation,
    size,
    segments: 16,
    color: '#fff',
    lineOpacity: 1,
    lineWidth: 2,
    locked: false,
    warnEnabled: true,
    warnColor: '#f00',
    warnOpacity: 0.2,
  }
}

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

describe('evaluateViolations', () => {
  it('reports nothing when all points are inside', () => {
    const c = container('rect', { x: 2, y: 2, z: 2 })
    expect(evaluateViolations([at(0.5, 0.5, 0.5), at(-0.9, 0, 0)], c).size).toBe(0)
  })

  it('reports the exceeded rect faces', () => {
    const c = container('rect', { x: 2, y: 2, z: 2 }) // half-extents 1
    expect([...evaluateViolations([at(1.5, 0, 0)], c)]).toEqual(['x+'])
    expect([...evaluateViolations([at(0, -1.5, 0)], c)]).toEqual(['y-'])
    const both = evaluateViolations([at(1.5, 0, 0), at(0, 0, -2)], c)
    expect(both.has('x+') && both.has('z-')).toBe(true)
  })

  it('accounts for container rotation (oriented frame)', () => {
    // 90° about Y maps a world +X point onto the box-local +Z face.
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const c = container('rect', { x: 1, y: 1, z: 1 }, [q.x, q.y, q.z, q.w]) // half 0.5
    expect([...evaluateViolations([at(1, 0, 0)], c)]).toEqual(['z+'])
  })

  it('reports cylinder side / top / bottom regions', () => {
    const c = container('cylinder', { x: 2, y: 2, z: 2 }) // radius 1, half-height 1
    expect([...evaluateViolations([at(1.5, 0, 0)], c)]).toEqual(['side'])
    expect([...evaluateViolations([at(0, 1.5, 0)], c)]).toEqual(['top'])
    expect([...evaluateViolations([at(0, -1.5, 0)], c)]).toEqual(['bottom'])
    expect(evaluateViolations([at(0.5, 0.5, 0.5)], c).size).toBe(0)
  })

  it('reports a sphere violation only when outside the radius', () => {
    const c = container('sphere', { x: 2, y: 2, z: 2 }) // radius 1
    expect(evaluateViolations([at(0.5, 0.5, 0.5)], c).size).toBe(0)
    expect([...evaluateViolations([at(1, 1, 1)], c)]).toEqual(['sphere'])
  })

  it('exposes region keys per shape', () => {
    expect(regionKeys('rect')).toHaveLength(6)
    expect(regionKeys('cylinder')).toEqual(['side', 'top', 'bottom'])
    expect(regionKeys('sphere')).toEqual(['sphere'])
  })
})
