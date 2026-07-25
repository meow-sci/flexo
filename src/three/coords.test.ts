import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyPlacement,
  colliderLocalFromWorld,
  colliderWorld,
  readPlacementTransform,
} from './coords'
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

  it.each(cases)('matches KSA CreateFromXyzRadians for (%f, %f, %f)', (x, y, z) => {
    const obj = new THREE.Object3D()
    applyPlacement(obj, makeTransform(x, y, z))
    const expected = ksaQuatFromXyzRadians(x, y, z)
    expect(obj.quaternion.angleTo(expected)).toBeLessThan(1e-6)
  })

  it.each(cases)(
    'round-trips position/rotation/scale via readPlacementTransform for (%f, %f, %f)',
    (x, y, z) => {
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
    },
  )
})

describe('collider owner frames', () => {
  const placement: Transform = {
    position: { x: 1, y: 2, z: -3 },
    rotation: { x: 0.3, y: -1.1, z: 0.7 },
    // A non-unit placement scale is DELIBERATELY ignored (ColliderModule composes only
    // position + rotation) — the collider keeps its own metre size in-game.
    scale: { x: 2, y: 2, z: 2 },
  }
  const collider: Transform = {
    position: { x: 0.5, y: 0, z: 0.25 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
    scale: { x: 1, y: 3, z: 1 },
  }

  it('composes exactly as ColliderModule does, ignoring placement scale', () => {
    const world = colliderWorld(collider, placement)
    expect(world.scale).toEqual(collider.scale)

    // worldPos = placement.position + R(placement.rotation) · collider.position
    const expected = new THREE.Vector3(0.5, 0, 0.25)
      .applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -1.1, 0.7, 'ZYX')))
      .add(new THREE.Vector3(1, 2, -3))
    expect(world.position.x).toBeCloseTo(expected.x, 10)
    expect(world.position.y).toBeCloseTo(expected.y, 10)
    expect(world.position.z).toBeCloseTo(expected.z, 10)
  })

  it('round-trips world ⇄ local exactly', () => {
    const back = colliderLocalFromWorld(colliderWorld(collider, placement), placement)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(back.position[axis]).toBeCloseTo(collider.position[axis], 10)
      expect(back.scale[axis]).toBeCloseTo(collider.scale[axis], 10)
    }
    // Compare rotations as quaternions — Euler triples are not unique.
    const q = (t: Transform) =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(t.rotation.x, t.rotation.y, t.rotation.z, 'ZYX'),
      )
    expect(q(back).angleTo(q(collider))).toBeCloseTo(0, 10)
  })

  it('is the identity for an identity placement', () => {
    const identity: Transform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }
    const world = colliderWorld(collider, identity)
    expect(world.position).toEqual(collider.position)
    expect(world.scale).toEqual(collider.scale)
  })
})
