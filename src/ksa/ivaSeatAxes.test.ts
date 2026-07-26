import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  SEAT_LOCAL_FORWARD,
  SEAT_LOCAL_UP,
  seatAxesFromRotation,
  seatRotationFromAxes,
} from './ivaSeatAxes'
import { applyPlacement } from '../three/coords'
import type { EulerXYZ, Transform, Vec3 } from './types'

/**
 * Locks the IVA seat rotation ⇄ (ForwardAxis, UpAxis) mapping, and — via the coords.ts
 * cross-check below — keeps the EULER_ORDER calibration knob singular: if applyPlacement
 * ever drifts back to three.js 'XYZ', the seat axes drift with it and this file fails.
 */

const rot = (x: number, y: number, z: number): EulerXYZ => ({ x, y, z })

const makeTransform = (r: EulerXYZ): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: r,
  scale: { x: 1, y: 1, z: 1 },
})

/** The multi-axis cases coords.test.ts:41-47 uses, plus one all-negative combination. */
const rotationCases: EulerXYZ[] = [
  rot(0, 0, 0),
  rot(0.3, 0.7, 1.1),
  rot(1.2, -0.4, 2.7),
  rot(0.5, 1.3, -0.9),
  rot(Math.PI, 0, Math.PI),
  rot(2.0944, 0, 0),
  rot(-1.9, 0.2, -2.4),
]

function expectVecClose(actual: Vec3, expected: Vec3, tol: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tol)
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tol)
  expect(Math.abs(actual.z - expected.z)).toBeLessThan(tol)
}

/** `expect(x).not.toBeNull()` does not narrow the static type; this does. */
function expectRotation(r: EulerXYZ | null): EulerXYZ {
  expect(r).not.toBeNull()
  if (r === null) throw new Error('expected a rotation')
  return r
}

const quat = (r: EulerXYZ): THREE.Quaternion =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z, 'ZYX'))

describe('seat axes fixed point (Core authoring)', () => {
  it('maps forward +X / up -Z to identity rotation', () => {
    const r = expectRotation(seatRotationFromAxes({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }))
    expectVecClose(r, { x: 0, y: 0, z: 0 }, 1e-12)
  })

  it('maps identity rotation back to forward +X / up -Z', () => {
    const { forward, up } = seatAxesFromRotation(rot(0, 0, 0))
    expectVecClose(forward, SEAT_LOCAL_FORWARD, 1e-12)
    expectVecClose(up, SEAT_LOCAL_UP, 1e-12)
  })
})

describe('seatAxesFromRotation agrees with coords.ts applyPlacement', () => {
  it.each(rotationCases)('for rotation $x, $y, $z', (r) => {
    const obj = new THREE.Object3D()
    applyPlacement(obj, makeTransform(r))
    const expectedForward = new THREE.Vector3(1, 0, 0).applyQuaternion(obj.quaternion)
    const expectedUp = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.quaternion)

    const { forward, up } = seatAxesFromRotation(r)
    expectVecClose(forward, expectedForward, 1e-12)
    expectVecClose(up, expectedUp, 1e-12)
  })
})

describe('rotation round-trips through the axis pair', () => {
  it.each(rotationCases)('for rotation $x, $y, $z', (r) => {
    const { forward, up } = seatAxesFromRotation(r)
    const back = expectRotation(seatRotationFromAxes(forward, up))
    // Compare as quaternions — Euler triples are not unique. 1e-6 is the tolerance
    // coords.test.ts:53 already uses: angleTo is 2·acos(|dot|), whose acos has a ~4.2e-8
    // floor even for numerically perfect input. Do NOT tighten it.
    expect(quat(back).angleTo(quat(r))).toBeLessThan(1e-6)
  })
})

describe('gimbal branch (forward along ±Z)', () => {
  it.each([1, -1])('recovers forward (0, 0, %i)', (sign) => {
    const forward: Vec3 = { x: 0, y: 0, z: sign }
    const r = expectRotation(seatRotationFromAxes(forward, { x: 0, y: 1, z: 0 }))
    expectVecClose(seatAxesFromRotation(r).forward, forward, 1e-9)
  })
})

describe('degenerate axis pairs return null', () => {
  it('rejects a zero forward axis', () => {
    expect(seatRotationFromAxes({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })).toBeNull()
  })

  it('rejects a zero up axis', () => {
    expect(seatRotationFromAxes({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeNull()
  })

  it('rejects an up axis parallel to forward', () => {
    expect(seatRotationFromAxes({ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeNull()
  })

  it('rejects an up axis anti-parallel to forward', () => {
    expect(seatRotationFromAxes({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBeNull()
  })
})

describe('non-perpendicular up axis is orthogonalised', () => {
  it('gives the same rotation as its orthogonalised equivalent', () => {
    const sloppy = expectRotation(
      seatRotationFromAxes({ x: 1, y: 0, z: 0 }, { x: 0.3, y: 0, z: -1 }),
    )
    const clean = expectRotation(seatRotationFromAxes({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }))
    expectVecClose(sloppy, clean, 1e-12)
  })
})

describe("Core's shipped seats", () => {
  // KSA Core crew quarters authors two seats, both with the schema-default axes (§1.7 of
  // plans/IVA_PLAN.md) — so both must import as an un-rotated seat.
  const coreSeats = [
    {
      position: { x: -0.45, y: 0.42, z: -0.35 },
      forward: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
    },
    {
      position: { x: -0.45, y: -0.42, z: -0.35 },
      forward: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
    },
  ]

  it.each(coreSeats)('import as identity rotation (seat at y=$position.y)', ({ forward, up }) => {
    const r = expectRotation(seatRotationFromAxes(forward, up))
    expectVecClose(r, { x: 0, y: 0, z: 0 }, 1e-12)
  })
})

describe('seatAxesFromRotation returns unit vectors', () => {
  it.each(rotationCases)('for rotation $x, $y, $z', (r) => {
    const { forward, up } = seatAxesFromRotation(r)
    expect(Math.abs(Math.hypot(forward.x, forward.y, forward.z) - 1)).toBeLessThan(1e-12)
    expect(Math.abs(Math.hypot(up.x, up.y, up.z) - 1)).toBeLessThan(1e-12)
  })
})
