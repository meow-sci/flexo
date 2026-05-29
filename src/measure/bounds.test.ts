import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { closestPointsBetweenBoxes, computeSelectionBounds, distance } from './bounds'

/** A unit cube (1×1×1) mesh at the given position/rotation. */
function cube(pos: [number, number, number] = [0, 0, 0], rotY = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  mesh.position.set(...pos)
  mesh.rotation.y = rotY
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('computeSelectionBounds — world', () => {
  it('returns null for an empty selection', () => {
    expect(computeSelectionBounds([], 'world')).toBeNull()
  })

  it('measures a single axis-aligned cube', () => {
    const b = computeSelectionBounds([cube()], 'world')!
    expect(b.size.x).toBeCloseTo(1)
    expect(b.size.y).toBeCloseTo(1)
    expect(b.size.z).toBeCloseTo(1)
    expect(b.quaternion).toEqual([0, 0, 0, 1])
  })

  it('expands across multiple cubes', () => {
    const b = computeSelectionBounds([cube([0, 0, 0]), cube([2, 0, 0])], 'world')!
    // cubes span x from -0.5 to 2.5 => 3 wide
    expect(b.size.x).toBeCloseTo(3)
    expect(b.size.y).toBeCloseTo(1)
    expect(b.center.x).toBeCloseTo(1)
  })

  it('grows the world AABB for a rotated cube (corners stick out)', () => {
    const b = computeSelectionBounds([cube([0, 0, 0], Math.PI / 4)], 'world')!
    // 45°-rotated unit cube has diagonal footprint ~√2 in x and z
    expect(b.size.x).toBeCloseTo(Math.SQRT2, 4)
    expect(b.size.z).toBeCloseTo(Math.SQRT2, 4)
    expect(b.size.y).toBeCloseTo(1)
  })
})

describe('computeSelectionBounds — oriented', () => {
  it('hugs a rotated cube tightly (≈1×1×1 in its own frame)', () => {
    const b = computeSelectionBounds([cube([0, 0, 0], Math.PI / 4)], 'oriented')!
    expect(b.size.x).toBeCloseTo(1, 4)
    expect(b.size.y).toBeCloseTo(1, 4)
    expect(b.size.z).toBeCloseTo(1, 4)
  })
})

describe('distance', () => {
  it('computes euclidean distance', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5)
  })
})

describe('closestPointsBetweenBoxes', () => {
  it('measures the gap between two separated boxes', () => {
    // A: x[0,1], B: x[3,4]; gap along x is 2
    const r = closestPointsBetweenBoxes(
      { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 },
      { x: 3, y: 0, z: 0 }, { x: 4, y: 1, z: 1 },
    )
    expect(r.distance).toBeCloseTo(2)
    expect(r.a.x).toBeCloseTo(1)
    expect(r.b.x).toBeCloseTo(3)
  })

  it('returns 0 distance for overlapping boxes', () => {
    const r = closestPointsBetweenBoxes(
      { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 },
      { x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 },
    )
    expect(r.distance).toBeCloseTo(0)
  })
})
