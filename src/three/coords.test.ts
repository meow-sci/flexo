import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyPlacement,
  colliderLocalFromWorld,
  colliderWorld,
  lightAimRotation,
  lightLocalFromWorld,
  lightWorld,
  lightWorldAim,
  readPlacementTransform,
} from './coords'
import type { EulerXYZ, Transform, Vec3 } from '../ksa/types'

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

describe('light owner frames', () => {
  // Lights differ from colliders in exactly one rule (LightModule.UpdateRenderData
  // transforms the offset by the owner's FULL matrix): the owner's scale IS applied
  // to the light's local position, and the light's own scale is pinned (1,1,1).
  const makeLight = (position: Vec3, rotation: EulerXYZ): Transform => ({
    position,
    rotation,
    scale: { x: 1, y: 1, z: 1 },
  })
  const makeOwner = (position: Vec3, rotation: EulerXYZ, scale: Vec3): Transform => ({
    position,
    rotation,
    scale,
  })
  const quatOf = (t: Transform) =>
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(t.rotation.x, t.rotation.y, t.rotation.z, 'ZYX'),
    )
  // Same-rotation assertion in quaternion space (Euler triples are not unique) via
  // sign-aligned components — angleTo's acos is ill-conditioned near 0 and turns a
  // ~1e-15 component error into a ~1e-7 angle, so it cannot pin 1e-12 round-trips.
  const expectSameRotation = (a: Transform, b: Transform) => {
    const qa = quatOf(a)
    const qb = quatOf(b)
    const sign = qa.dot(qb) < 0 ? -1 : 1
    expect(qa.x).toBeCloseTo(sign * qb.x, 12)
    expect(qa.y).toBeCloseTo(sign * qb.y, 12)
    expect(qa.z).toBeCloseTo(sign * qb.z, 12)
    expect(qa.w).toBeCloseTo(sign * qb.w, 12)
  }

  it('part-level (owner null) passes through verbatim with pinned scale', () => {
    const light = makeLight({ x: 0.38, y: 0.21, z: -0.5 }, { x: 0.3, y: -0.7, z: 1.1 })
    const world = lightWorld(light, null)
    expect(world.position).toEqual(light.position)
    expect(world.rotation).toEqual(light.rotation)
    expect(world.scale).toEqual({ x: 1, y: 1, z: 1 })
    const back = lightLocalFromWorld(world, null)
    expect(back.position).toEqual(light.position)
    expect(back.rotation).toEqual(light.rotation)
    expect(back.scale).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('round-trips through a rotated + translated + NON-uniformly scaled owner to 1e-12', () => {
    const light = makeLight({ x: 0.5, y: -0.25, z: 0.75 }, { x: 0.4, y: -0.6, z: 1.2 })
    const owner = makeOwner(
      { x: 1, y: 2, z: -3 },
      { x: 0.3, y: -1.1, z: 0.7 },
      { x: 2, y: 0.5, z: 3 },
    )
    const back = lightLocalFromWorld(lightWorld(light, owner), owner)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(back.position[axis]).toBeCloseTo(light.position[axis], 12)
      expect(back.scale[axis]).toBe(1)
    }
    expectSameRotation(back, light)
  })

  it('round-trips through a MIRRORED owner (negative scale axis)', () => {
    const light = makeLight({ x: 0.4, y: 0.1, z: -0.2 }, { x: -0.3, y: 0.5, z: 0.9 })
    const owner = makeOwner(
      { x: -0.5, y: 1.25, z: 2 },
      { x: 0.2, y: 0.4, z: -0.6 },
      { x: -2, y: 1, z: 3 },
    )
    const back = lightLocalFromWorld(lightWorld(light, owner), owner)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(back.position[axis]).toBeCloseTo(light.position[axis], 12)
    }
    expectSameRotation(back, light)
    // Sanity: the negative axis really participates — the world offset is mirrored.
    const world = lightWorld(makeLight({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: -2, y: 1, z: 1 },
    })
    expect(world.position).toEqual({ x: -2, y: 0, z: 0 })
  })

  it('matches the hand-computed pose for a 90°-about-Y owner (scale INCLUDED, unlike colliders)', () => {
    // Owner: position (1,0,0), KSA Euler (0, π/2, 0). A single-axis rotation is
    // identical under KSA-"XYZ" (three 'ZYX') and every other order: R = Ry(+90°).
    // Right-handed Ry(θ): x' = x·cosθ + z·sinθ; z' = −x·sinθ + z·cosθ, so +X ↦ −Z.
    //
    // Unit owner scale:
    //   world = (1,0,0) + Ry(90°)·(1·1, 0, 0) = (1,0,0) + (0,0,−1) = (1, 0, −1)
    const light = makeLight({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const owner = makeOwner(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 1, y: 1, z: 1 },
    )
    const world = lightWorld(light, owner)
    expect(world.position.x).toBeCloseTo(1, 12)
    expect(world.position.y).toBeCloseTo(0, 12)
    expect(world.position.z).toBeCloseTo(-1, 12)
    // The world aim (rotated +X) is the same −Z; identity light rotation means the
    // world rotation IS the owner rotation.
    const aim = lightWorldAim(world.rotation)
    expect(aim.x).toBeCloseTo(0, 12)
    expect(aim.y).toBeCloseTo(0, 12)
    expect(aim.z).toBeCloseTo(-1, 12)
    expect(quatOf(world).angleTo(quatOf(owner))).toBeCloseTo(0, 6)

    // Owner scaled ×2 uniformly: the local offset scales BEFORE rotating —
    //   world = (1,0,0) + Ry(90°)·(2·1, 0, 0) = (1,0,0) + (0,0,−2) = (1, 0, −2)
    // (colliderWorld would ignore the scale and return (1, 0, −1) — the trap.)
    const scaledOwner = makeOwner(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 2, y: 2, z: 2 },
    )
    const world2 = lightWorld(light, scaledOwner)
    expect(world2.position.x).toBeCloseTo(1, 12)
    expect(world2.position.y).toBeCloseTo(0, 12)
    expect(world2.position.z).toBeCloseTo(-2, 12)
  })

  it('lightWorldAim: identity rotation aims +X; 90° about Z aims +Y', () => {
    const aimIdentity = lightWorldAim({ x: 0, y: 0, z: 0 })
    expect(aimIdentity.x).toBeCloseTo(1, 12)
    expect(aimIdentity.y).toBeCloseTo(0, 12)
    expect(aimIdentity.z).toBeCloseTo(0, 12)
    const aimZ90 = lightWorldAim({ x: 0, y: 0, z: Math.PI / 2 })
    expect(aimZ90.x).toBeCloseTo(0, 12)
    expect(aimZ90.y).toBeCloseTo(1, 12)
    expect(aimZ90.z).toBeCloseTo(0, 12)
  })

  it('treats a degenerate (~0) owner scale axis as 1 in the inverse', () => {
    const owner = makeOwner({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 1 })
    const world: Transform = {
      position: { x: 3, y: 4, z: 5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }
    // x divides by 1 (guarded), y by 2, z by 1 — never NaN/Infinity.
    const back = lightLocalFromWorld(world, owner)
    expect(back.position.x).toBeCloseTo(3, 12)
    expect(back.position.y).toBeCloseTo(2, 12)
    expect(back.position.z).toBeCloseTo(5, 12)
  })
})

describe('lightAimRotation (aim-vector commit — ΔQ · R, plan §3.9-7)', () => {
  const quatOf = (r: EulerXYZ) =>
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z, 'ZYX'))
  // Same-rotation assertion in quaternion space, sign-aligned (Euler triples and
  // quaternion signs are both non-unique).
  const expectSameQuat = (a: THREE.Quaternion, b: THREE.Quaternion, digits = 10) => {
    const sign = a.dot(b) < 0 ? -1 : 1
    expect(a.x).toBeCloseTo(sign * b.x, digits)
    expect(a.y).toBeCloseTo(sign * b.y, digits)
    expect(a.z).toBeCloseTo(sign * b.z, digits)
    expect(a.w).toBeCloseTo(sign * b.w, digits)
  }

  it('re-aims +X → +Y as a 90° rotation about Z', () => {
    const result = lightAimRotation({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    expect(result).not.toBeNull()
    const aim = lightWorldAim(result!)
    expect(aim.x).toBeCloseTo(0, 10)
    expect(aim.y).toBeCloseTo(1, 10)
    expect(aim.z).toBeCloseTo(0, 10)
    expectSameQuat(
      quatOf(result!),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
    )
  })

  it('preserves roll: a pre-rolled light re-aimed +X → +Y becomes exactly Rz(90°)·Rx(roll)', () => {
    // Roll about the aim axis leaves the aim at +X, so ΔQ is still the pure Rz(90°) —
    // and it composes ON TOP of the roll instead of discarding it.
    const roll = 0.7
    const result = lightAimRotation({ x: roll, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    expect(result).not.toBeNull()
    const expected = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll))
    expectSameQuat(quatOf(result!), expected)
    const aim = lightWorldAim(result!)
    expect(aim.y).toBeCloseTo(1, 10)
  })

  it('is the identity for a parallel (already-aimed) input, and normalizes non-unit input', () => {
    const rotation: EulerXYZ = { x: 0.3, y: -0.7, z: 1.1 }
    const currentAim = lightWorldAim(rotation)
    // Same direction at 5× length: normalize on entry, ΔQ = identity.
    const result = lightAimRotation(rotation, {
      x: currentAim.x * 5,
      y: currentAim.y * 5,
      z: currentAim.z * 5,
    })
    expect(result).not.toBeNull()
    expectSameQuat(quatOf(result!), quatOf(rotation))
  })

  it('handles the antiparallel flip without NaN (three picks a stable 180° axis)', () => {
    const result = lightAimRotation({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })
    expect(result).not.toBeNull()
    for (const axis of ['x', 'y', 'z'] as const) expect(Number.isFinite(result![axis])).toBe(true)
    const aim = lightWorldAim(result!)
    expect(aim.x).toBeCloseTo(-1, 10)
    expect(aim.y).toBeCloseTo(0, 10)
    expect(aim.z).toBeCloseTo(0, 10)
  })

  it('rejects a degenerate (≈zero) aim with null — the caller keeps the prior rotation', () => {
    expect(lightAimRotation({ x: 0.2, y: 0.4, z: -0.6 }, { x: 0, y: 0, z: 0 })).toBeNull()
    expect(lightAimRotation({ x: 0, y: 0, z: 0 }, { x: 1e-9, y: -1e-9, z: 0 })).toBeNull()
  })
})
