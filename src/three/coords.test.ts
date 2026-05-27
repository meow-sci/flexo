import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyPlacement, readPlacementTransform } from './coords'
import type { Transform } from '../ksa/types'

/**
 * Locks the calibrated coordinate mapping (see coords.ts): KSA stores rotation as
 * Euler "XYZ" radians, but its quaternion conversion composes to three.js 'ZYX'.
 * If applyPlacement ever drifts back to three.js 'XYZ', multi-axis rotations break.
 */

// KSA Brutal engine: QuaternionEx.CreateFromXyzRadians — the ground truth for how
// KSA turns its stored Euler "XYZ" radians into an orientation quaternion.
function ksaQuatFromXyzRadians(x: number, y: number, z: number): THREE.Quaternion {
  const c1 = Math.cos(x / 2)
  const c2 = Math.cos(y / 2)
  const c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2)
  const s2 = Math.sin(y / 2)
  const s3 = Math.sin(z / 2)
  return new THREE.Quaternion(
    -c1 * s2 * s3 + c2 * c3 * s1, // x
    c1 * c3 * s2 + s1 * c2 * s3, // y
    c1 * c2 * s3 - s1 * c3 * s2, // z
    c1 * c2 * c3 + s1 * s2 * s3, // w
  )
}

const makeTransform = (x: number, y: number, z: number): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x, y, z },
  scale: { x: 1, y: 1, z: 1 },
})

describe('coords applyPlacement rotation order', () => {
  const cases: Array<[number, number, number]> = [
    [0.3, 0.7, 1.1],
    [1.2, -0.4, 2.7],
    [0.5, 1.3, -0.9],
    [Math.PI, 0, Math.PI],
    [2.0944, 0, 0], // single-axis: identical under any order
  ]

  it.each(cases)(
    'matches KSA CreateFromXyzRadians for (%f, %f, %f)',
    (x, y, z) => {
      const obj = new THREE.Object3D()
      applyPlacement(obj, makeTransform(x, y, z))
      const expected = ksaQuatFromXyzRadians(x, y, z)
      expect(obj.quaternion.angleTo(expected)).toBeLessThan(1e-6)
    },
  )

  it.each(cases)('round-trips position/rotation/scale via readPlacementTransform for (%f, %f, %f)', (x, y, z) => {
    const obj = new THREE.Object3D()
    const t: Transform = {
      position: { x: 1.5, y: -2.25, z: 0.75 },
      rotation: { x, y, z },
      scale: { x: 1, y: 1, z: 1 },
    }
    applyPlacement(obj, t)
    const back = readPlacementTransform(obj)
    // Compare orientations via quaternion (Euler triples can differ but be equivalent).
    const q1 = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(back.rotation.x, back.rotation.y, back.rotation.z, 'ZYX'),
    )
    expect(q1.angleTo(ksaQuatFromXyzRadians(x, y, z))).toBeLessThan(1e-6)
    expect(back.position).toEqual(t.position)
    expect(back.scale).toEqual(t.scale)
  })
})
